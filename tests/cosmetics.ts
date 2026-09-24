import { strict as assert } from "node:assert";
import pg from "pg";
import { createTestSession, type TestSession } from "./auth-session";
import { assetHash } from "../server/cosmetics/assets";
import { grantCosmetics } from "../server/cosmetics/repository";
import { closeDatabase, runDatabase } from "../server/db/client";
import { databaseConnectionUrl, databaseSsl } from "../server/db/url";
import type { Collection, EquippedLookup } from "../src/lib/cosmetics";

const url = process.env.TEST_URL ?? "http://localhost:3000";
const suffix = Math.random().toString(36).slice(2, 7);
const back = `test-back:${suffix}`;
const draft = `test-draft:${suffix}`;
const retired = `test-retired:${suffix}`;
const picture = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350"><rect width="250" height="350" fill="#123"/></svg>',
);
const hash = assetHash(picture);

async function api<T>(
  session: TestSession | null,
  path: string,
  init: { method?: string; body?: unknown; origin?: string } = {},
) {
  const response = await fetch(url + path, {
    method: init.method ?? "GET",
    headers: {
      ...(session ? { cookie: session.cookie } : {}),
      origin: init.origin ?? url,
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return {
    status: response.status,
    body: (await response.json()) as T & { error?: string },
  };
}

const equip = (session: TestSession, kind: string, cosmeticId: string | null) =>
  api<Record<string, string>>(session, `/api/cosmetics/equipped/${kind}`, {
    method: "PUT",
    body: { cosmeticId },
  });

const db = new pg.Client({
  connectionString: databaseConnectionUrl(),
  ssl: databaseSsl(),
});
await db.connect();

try {
  // Two items of our own: one listed, one still in draft.
  for (const [id, status] of [
    [back, "active"],
    [draft, "draft"],
    [retired, "retired"],
  ] as const) {
    await db.query(
      `insert into cosmetic (id, kind, name, rarity, status, unlock_hint)
       values ($1, 'card-back', $1, 'rare', $2, 'Test')`,
      [id, status],
    );
    await db.query(
      `insert into cosmetic_asset (cosmetic_id, content_type, data, hash)
       values ($1, 'image/svg+xml', $2, $3)`,
      [id, picture, hash],
    );
  }

  const alice = await createTestSession(url, `Skins A ${suffix}`);
  const bob = await createTestSession(url, `Skins B ${suffix}`);

  // Signed-in only, except the pictures.
  assert.equal((await api(null, "/api/cosmetics")).status, 401);

  // The active item is listed, locked; the draft is not.
  const collection = await api<Collection>(alice, "/api/cosmetics");
  assert.equal(collection.status, 200);
  const listed = collection.body.items.find((item) => item.id === back);
  assert.ok(listed, "the active item is listed");
  assert.equal(listed.owned, null);
  assert.equal(listed.equipped, false);
  assert.ok(listed.asset?.endsWith(`v=${hash}`));
  assert.ok(!collection.body.items.some((item) => item.id === draft));

  // Nobody wears what they do not own.
  const notOwned = await equip(alice, "card-back", back);
  assert.equal(notOwned.status, 409);

  await db.query(
    `insert into player_cosmetic (user_id, cosmetic_id, source)
     values ($1, $2, 'grant'), ($1, $3, 'grant')`,
    [alice.userId, back, draft],
  );

  // Owned, but not under another kind, and never a draft.
  assert.equal((await equip(alice, "chicken", back)).status, 400);
  assert.equal((await equip(alice, "card-back", draft)).status, 404);
  assert.equal((await equip(alice, "hat", back)).status, 404);

  // Only the club page itself may change what a player wears.
  const foreign = await api(alice, "/api/cosmetics/equipped/card-back", {
    method: "PUT",
    body: { cosmeticId: back },
    origin: "https://example.test",
  });
  assert.equal(foreign.status, 403);

  const worn = await equip(alice, "card-back", back);
  assert.equal(worn.status, 200);
  assert.equal(worn.body["card-back"], listed.asset);

  const mine = await api<Collection>(alice, "/api/cosmetics");
  const owned = mine.body.items.find((item) => item.id === back)!;
  assert.equal(owned.owned?.source, "grant");
  assert.equal(owned.equipped, true);

  // Another player sees it; players who wear nothing get an empty entry.
  const lookup = await api<EquippedLookup>(
    bob,
    `/api/cosmetics/equipped?users=${alice.userId},${bob.userId}`,
  );
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body[alice.userId]?.["card-back"], listed.asset);
  assert.deepEqual(lookup.body[bob.userId], {});
  const tooMany = Array.from({ length: 51 }, (_, index) => `u${index}`);
  assert.equal(
    (await api(bob, `/api/cosmetics/equipped?users=${tooMany.join(",")}`))
      .status,
    400,
  );

  // Pictures: cached forever under their hash, never able to run script.
  const asset = await fetch(`${url}${listed.asset}`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "image/svg+xml");
  assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
  assert.match(
    asset.headers.get("content-security-policy") ?? "",
    /default-src 'none'/,
  );
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), picture);
  const stale = await fetch(
    `${url}/api/cosmetics/${encodeURIComponent(back)}/asset?v=old`,
  );
  assert.doesNotMatch(stale.headers.get("cache-control") ?? "", /immutable/);
  await stale.arrayBuffer();
  const hidden = await fetch(
    `${url}/api/cosmetics/${encodeURIComponent(draft)}/asset?v=${hash}`,
  );
  assert.equal(hidden.status, 404);
  await hidden.arrayBuffer();

  // Rewards only hand out what can still be obtained.
  await runDatabase(
    grantCosmetics(bob.userId, [back, draft, retired], "grant"),
  );
  const granted = await db.query<{ cosmetic_id: string }>(
    `select cosmetic_id from player_cosmetic where user_id = $1`,
    [bob.userId],
  );
  assert.deepEqual(
    granted.rows.map((row) => row.cosmetic_id),
    [back],
  );

  // Back to the Classique.
  const classic = await equip(alice, "card-back", null);
  assert.equal(classic.status, 200);
  assert.deepEqual(classic.body, {});

  console.log("Skins · tous les scénarios passent.");
} finally {
  await db.query(
    `delete from player_equipped_cosmetic where cosmetic_id in ($1, $2, $3)`,
    [back, draft, retired],
  );
  await db.query(
    `delete from player_cosmetic where cosmetic_id in ($1, $2, $3)`,
    [back, draft, retired],
  );
  await db.query(`delete from cosmetic where id in ($1, $2, $3)`, [
    back,
    draft,
    retired,
  ]);
  await db.end();
  await closeDatabase();
}

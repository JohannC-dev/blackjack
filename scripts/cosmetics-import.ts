/**
 * Adds or updates skins from a folder holding a manifest.json and the
 * pictures it names. Replaying it is harmless: every item is upserted, and
 * items missing from the manifest are left as they are.
 *
 *   bun scripts/cosmetics-import.ts <dossier> [--dry-run]
 *
 * manifest.json:
 *   [{
 *     "id": "card-back:neon",          // stable, never reused
 *     "kind": "card-back",             // card-back | profile-icon | chicken | mine-gem
 *     "name": "Dos Néon",
 *     "description": "…",
 *     "rarity": "rare",                // common | rare | epic | legendary
 *     "status": "active",              // draft | active | retired
 *     "unlockHint": "Bientôt en boutique",
 *     "sortOrder": 10,
 *     "priceCredits": null,            // optional, not for sale while null
 *     "priceCents": null, "priceCurrency": null,
 *     "asset": "neon.svg"              // optional, next to the manifest
 *   }]
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { Either, ParseResult, Schema } from "effect";
import { COSMETIC_KINDS, COSMETIC_RARITIES } from "../src/lib/cosmetics";
import {
  AssetError,
  assetHash,
  validateAsset,
} from "../server/cosmetics/assets";
import { authDatabase, closeDatabase } from "../server/db/client";
import { cosmetic, cosmeticAsset } from "../server/db/schema";

const Text = Schema.Trim.pipe(Schema.nonEmptyString());
const optional = <A, I>(schema: Schema.Schema<A, I>, fallback: A) =>
  Schema.optionalWith(schema, { default: () => fallback, nullable: true });
const Positive = Schema.Int.pipe(Schema.positive());
/** One of a closed list, reported in a single line. */
const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  Schema.Literal(...values).annotations({
    message: () => ({
      message: `attendu : ${values.join(", ")}`,
      override: true,
    }),
  });

const Entry = Schema.Struct({
  id: Text.pipe(Schema.maxLength(64)),
  kind: oneOf(COSMETIC_KINDS),
  name: Text,
  description: optional(Schema.Trim, ""),
  rarity: optional(oneOf(COSMETIC_RARITIES), "common"),
  status: optional(oneOf(["draft", "active", "retired"]), "draft"),
  unlockHint: optional(Schema.NullOr(Text), null),
  sortOrder: optional(Schema.Int, 0),
  priceCredits: optional(Schema.NullOr(Positive), null),
  priceCents: optional(Schema.NullOr(Positive), null),
  priceCurrency: optional(
    Schema.NullOr(Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/))),
    null,
  ),
  asset: optional(Schema.NullOr(Text), null),
}).pipe(
  Schema.filter(
    (entry) =>
      (entry.priceCents === null) === (entry.priceCurrency === null) ||
      "« priceCents » et « priceCurrency » vont ensemble.",
  ),
);

const Manifest = Schema.Array(Entry);

function fail(message: string): never {
  throw new AssetError(message);
}

const [folder, ...flags] = process.argv.slice(2);
if (!folder) {
  console.error(
    "Usage : bun scripts/cosmetics-import.ts <dossier> [--dry-run]",
  );
  process.exit(1);
}
const dryRun = flags.includes("--dry-run");

try {
  const manifest = Schema.decodeUnknownEither(Manifest)(
    JSON.parse(await readFile(join(folder, "manifest.json"), "utf8")),
    { errors: "all" },
  );
  if (Either.isLeft(manifest)) {
    const issues = ParseResult.ArrayFormatter.formatErrorSync(manifest.left);
    const where = (path: readonly PropertyKey[]) =>
      `entrée ${Number(path[0]) + 1}${path.length > 1 ? ` · ${path.slice(1).join(".")}` : ""}`;
    // An optional field also reports "not null", "not undefined": noise.
    const absent = /^Expected (null|undefined), actual/;
    const lines = issues.flatMap(({ path, message }) =>
      absent.test(message) &&
      issues.some(
        (other) =>
          where(other.path) === where(path) && !absent.test(other.message),
      )
        ? []
        : [`  ${where(path)} : ${message}`],
    );
    fail(["manifest.json invalide :", ...lines].join("\n"));
  }
  const entries = manifest.right;
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) fail(`Id « ${entry.id} » présent deux fois.`);
    ids.add(entry.id);
  }

  // Every file is checked before anything is written.
  const assets = new Map<
    string,
    { data: Buffer; contentType: string; hash: string }
  >();
  for (const entry of entries) {
    if (!entry.asset) continue;
    const data = await readFile(join(folder, entry.asset));
    const contentType = validateAsset(entry.kind, entry.asset, data);
    assets.set(entry.id, { data, contentType, hash: assetHash(data) });
  }

  if (dryRun) {
    console.log(`${entries.length} skin(s) valides, rien n’a été écrit.`);
  } else {
    await authDatabase.transaction(async (tx) => {
      for (const entry of entries) {
        const [existing] = await tx
          .select({ kind: cosmetic.kind })
          .from(cosmetic)
          .where(eq(cosmetic.id, entry.id));
        // Players may wear it under its kind: create a new id instead.
        if (existing && existing.kind !== entry.kind)
          fail(
            `« ${entry.id} » est déjà un ${existing.kind}, son type ne peut pas changer.`,
          );
        const { asset: _file, ...item } = entry;
        await tx
          .insert(cosmetic)
          .values(item)
          .onConflictDoUpdate({
            target: cosmetic.id,
            set: { ...item, updatedAt: sql`now()` },
          });
        const asset = assets.get(entry.id);
        if (asset)
          await tx
            .insert(cosmeticAsset)
            .values({ cosmeticId: entry.id, ...asset })
            .onConflictDoUpdate({
              target: cosmeticAsset.cosmeticId,
              set: { ...asset, updatedAt: sql`now()` },
            });
        console.log(
          `${existing ? "Mis à jour" : "Ajouté"} · ${entry.id} (${entry.status}${asset ? ", visuel " + asset.hash : ""})`,
        );
      }
    });
    console.log(`${entries.length} skin(s) importé(s).`);
  }
} catch (error) {
  console.error(
    error instanceof AssetError || error instanceof SyntaxError
      ? error.message
      : error,
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

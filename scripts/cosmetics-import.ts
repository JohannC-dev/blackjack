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
import {
  COSMETIC_RARITIES,
  isCosmeticKind,
  type CosmeticKind,
  type CosmeticRarity,
  type CosmeticStatus,
} from "../src/lib/cosmetics";
import {
  AssetError,
  assetHash,
  validateAsset,
} from "../server/cosmetics/assets";
import { authDatabase, closeDatabase } from "../server/db/client";
import { cosmetic, cosmeticAsset } from "../server/db/schema";

type Entry = {
  id: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  rarity: CosmeticRarity;
  status: CosmeticStatus;
  unlockHint: string | null;
  sortOrder: number;
  priceCredits: number | null;
  priceCents: number | null;
  priceCurrency: string | null;
  asset: string | null;
};

const STATUSES: readonly CosmeticStatus[] = ["draft", "active", "retired"];

function fail(message: string): never {
  throw new AssetError(message);
}

function readEntry(raw: unknown, index: number): Entry {
  const at = `Entrée ${index + 1}`;
  if (!raw || typeof raw !== "object") fail(`${at} : objet attendu.`);
  const value = raw as Record<string, unknown>;
  const text = (key: string, optional = false) => {
    const field = value[key];
    if (field === undefined || field === null) {
      if (optional) return null;
      fail(`${at} : « ${key} » manquant.`);
    }
    if (typeof field !== "string" || !field.trim())
      fail(`${at} : « ${key} » doit être un texte.`);
    return field.trim();
  };
  const count = (key: string) => {
    const field = value[key];
    if (field === undefined || field === null) return null;
    if (!Number.isSafeInteger(field) || (field as number) <= 0)
      fail(`${at} : « ${key} » doit être un entier positif.`);
    return field as number;
  };

  const id = text("id")!;
  if (id.length > 64) fail(`${at} : l’id dépasse 64 caractères.`);
  const kind = text("kind")!;
  if (!isCosmeticKind(kind)) fail(`${at} : type « ${kind} » inconnu.`);
  const rarity = text("rarity", true) ?? "common";
  if (!COSMETIC_RARITIES.includes(rarity as CosmeticRarity))
    fail(`${at} : rareté « ${rarity} » inconnue.`);
  const status = text("status", true) ?? "draft";
  if (!STATUSES.includes(status as CosmeticStatus))
    fail(`${at} : statut « ${status} » inconnu.`);
  const priceCents = count("priceCents");
  const priceCurrency = text("priceCurrency", true);
  if ((priceCents === null) !== (priceCurrency === null))
    fail(`${at} : « priceCents » et « priceCurrency » vont ensemble.`);
  const sortOrder = value.sortOrder ?? 0;
  if (!Number.isSafeInteger(sortOrder))
    fail(`${at} : « sortOrder » doit être un entier.`);

  return {
    id,
    kind,
    name: text("name")!,
    description: text("description", true) ?? "",
    rarity: rarity as CosmeticRarity,
    status: status as CosmeticStatus,
    unlockHint: text("unlockHint", true),
    sortOrder: sortOrder as number,
    priceCredits: count("priceCredits"),
    priceCents,
    priceCurrency: priceCurrency?.toUpperCase() ?? null,
    asset: text("asset", true),
  };
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
  const manifest = JSON.parse(
    await readFile(join(folder, "manifest.json"), "utf8"),
  ) as unknown;
  if (!Array.isArray(manifest)) fail("manifest.json doit être une liste.");
  const entries = manifest.map(readEntry);
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

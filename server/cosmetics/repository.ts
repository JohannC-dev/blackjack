import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import {
  COSMETIC_KINDS,
  cosmeticAssetUrl,
  type Collection,
  type CollectionItem,
  type CosmeticKind,
  type CosmeticSource,
  type EquippedLookup,
  type EquippedSkins,
} from "../../src/lib/cosmetics";
import {
  cosmetic,
  cosmeticAsset,
  playerCosmetic,
  playerEquippedCosmetic,
} from "../db/schema";

/** A refusal the player can act on. */
export class CosmeticError extends Data.TaggedError("CosmeticError")<{
  readonly message: string;
  readonly status: 400 | 404 | 409;
}> {}

/**
 * Gives skins to a player. Ids missing from the catalogue are skipped, so a
 * reward never fails the operation it belongs to; owning twice is a no-op.
 */
export const grantCosmetics = (
  userId: string,
  ids: readonly string[],
  source: CosmeticSource,
) =>
  Effect.gen(function* () {
    if (!ids.length) return;
    const db = yield* PgDrizzle;
    const known = yield* db
      .select({ id: cosmetic.id })
      .from(cosmetic)
      .where(inArray(cosmetic.id, [...ids]));
    if (!known.length) return;
    yield* db
      .insert(playerCosmetic)
      .values(known.map(({ id }) => ({ userId, cosmeticId: id, source })))
      .onConflictDoNothing();
  });

/**
 * Everything the player may see: the active catalogue, plus the retired
 * items they own. Drafts stay hidden, even from their owners.
 */
export const collectionFor = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const rows = yield* db
      .select({
        id: cosmetic.id,
        kind: cosmetic.kind,
        name: cosmetic.name,
        description: cosmetic.description,
        rarity: cosmetic.rarity,
        status: cosmetic.status,
        unlockHint: cosmetic.unlockHint,
        sortOrder: cosmetic.sortOrder,
        hash: cosmeticAsset.hash,
        source: playerCosmetic.source,
        unlockedAt: playerCosmetic.createdAt,
        equipped: playerEquippedCosmetic.cosmeticId,
      })
      .from(cosmetic)
      .leftJoin(cosmeticAsset, eq(cosmeticAsset.cosmeticId, cosmetic.id))
      .leftJoin(
        playerCosmetic,
        and(
          eq(playerCosmetic.cosmeticId, cosmetic.id),
          eq(playerCosmetic.userId, userId),
        ),
      )
      .leftJoin(
        playerEquippedCosmetic,
        and(
          eq(playerEquippedCosmetic.userId, userId),
          eq(playerEquippedCosmetic.cosmeticId, cosmetic.id),
        ),
      )
      .where(
        or(
          eq(cosmetic.status, "active"),
          and(eq(cosmetic.status, "retired"), isNotNull(playerCosmetic.userId)),
        ),
      );

    const kindOrder = (kind: CosmeticKind) => COSMETIC_KINDS.indexOf(kind);
    rows.sort(
      (a, b) =>
        kindOrder(a.kind) - kindOrder(b.kind) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name, "fr"),
    );
    return {
      items: rows.map((row): CollectionItem => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        description: row.description,
        rarity: row.rarity,
        unlockHint: row.unlockHint,
        asset: row.hash ? cosmeticAssetUrl(row.id, row.hash) : null,
        owned:
          row.source && row.unlockedAt
            ? {
                source: row.source,
                unlockedAt: row.unlockedAt.toISOString(),
              }
            : null,
        equipped: row.equipped !== null,
        retired: row.status === "retired",
      })),
    } satisfies Collection;
  });

/**
 * What these players wear, by player id. Only items with a picture and out
 * of draft count, so a withdrawn picture falls back to the Classique.
 */
export const equippedFor = (userIds: readonly string[]) =>
  Effect.gen(function* () {
    const lookup: EquippedLookup = {};
    if (!userIds.length) return lookup;
    const db = yield* PgDrizzle;
    const rows = yield* db
      .select({
        userId: playerEquippedCosmetic.userId,
        kind: playerEquippedCosmetic.kind,
        id: cosmetic.id,
        hash: cosmeticAsset.hash,
      })
      .from(playerEquippedCosmetic)
      .innerJoin(cosmetic, eq(cosmetic.id, playerEquippedCosmetic.cosmeticId))
      .innerJoin(cosmeticAsset, eq(cosmeticAsset.cosmeticId, cosmetic.id))
      .where(
        and(
          inArray(playerEquippedCosmetic.userId, [...userIds]),
          ne(cosmetic.status, "draft"),
        ),
      );
    for (const userId of userIds) lookup[userId] = {};
    for (const row of rows)
      lookup[row.userId]![row.kind] = cosmeticAssetUrl(row.id, row.hash);
    return lookup;
  });

/**
 * Wears an owned skin, or goes back to the Classique with a null id. Returns
 * what the player now wears.
 */
export const equipCosmetic = (
  userId: string,
  kind: CosmeticKind,
  cosmeticId: string | null,
) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    if (cosmeticId === null) {
      yield* db
        .delete(playerEquippedCosmetic)
        .where(
          and(
            eq(playerEquippedCosmetic.userId, userId),
            eq(playerEquippedCosmetic.kind, kind),
          ),
        );
    } else {
      const [item] = yield* db
        .select({
          kind: cosmetic.kind,
          status: cosmetic.status,
          hash: cosmeticAsset.hash,
          owner: playerCosmetic.userId,
        })
        .from(cosmetic)
        .leftJoin(cosmeticAsset, eq(cosmeticAsset.cosmeticId, cosmetic.id))
        .leftJoin(
          playerCosmetic,
          and(
            eq(playerCosmetic.cosmeticId, cosmetic.id),
            eq(playerCosmetic.userId, userId),
          ),
        )
        .where(eq(cosmetic.id, cosmeticId));
      if (!item || item.status === "draft")
        return yield* new CosmeticError({
          message: "Ce skin n’existe pas.",
          status: 404,
        });
      if (item.kind !== kind)
        return yield* new CosmeticError({
          message: "Ce skin ne va pas à cet emplacement.",
          status: 400,
        });
      if (!item.owner)
        return yield* new CosmeticError({
          message: "Vous ne possédez pas ce skin.",
          status: 409,
        });
      if (!item.hash)
        return yield* new CosmeticError({
          message: "Ce skin n’a pas encore de visuel.",
          status: 409,
        });
      yield* db
        .insert(playerEquippedCosmetic)
        .values({ userId, kind, cosmeticId })
        .onConflictDoUpdate({
          target: [playerEquippedCosmetic.userId, playerEquippedCosmetic.kind],
          set: { cosmeticId, updatedAt: sql`now()` },
        });
    }
    const lookup = yield* equippedFor([userId]);
    return lookup[userId] ?? ({} satisfies EquippedSkins);
  });

/** The picture of a skin out of draft, or null. */
export const cosmeticAssetOf = (cosmeticId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const [asset] = yield* db
      .select({
        contentType: cosmeticAsset.contentType,
        data: cosmeticAsset.data,
        hash: cosmeticAsset.hash,
      })
      .from(cosmeticAsset)
      .innerJoin(cosmetic, eq(cosmetic.id, cosmeticAsset.cosmeticId))
      .where(
        and(
          eq(cosmeticAsset.cosmeticId, cosmeticId),
          ne(cosmetic.status, "draft"),
        ),
      );
    return asset ?? null;
  });

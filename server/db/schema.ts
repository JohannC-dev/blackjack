import { sql } from "drizzle-orm";
import type {
  CosmeticKind,
  CosmeticRarity,
  CosmeticSource,
  CosmeticStatus,
} from "../../src/lib/cosmetics";
import type { Audience } from "../../src/lib/social";
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("user_email_idx").on(table.email)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_idx").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const walletAccount = pgTable(
  "wallet_account",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    balanceMinor: bigint("balance_minor", { mode: "number" })
      .default(50_000_000)
      .notNull(),
    version: bigint("version", { mode: "number" }).default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("wallet_balance_non_negative", sql`${table.balanceMinor} >= 0`),
  ],
);

export const walletEntry = pgTable(
  "wallet_entry",
  {
    operationId: text("operation_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    game: text("game").notNull(),
    kind: text("kind").default("legacy").notNull(),
    reason: text("reason").notNull(),
    referenceId: text("reference_id"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    balanceAfterMinor: bigint("balance_after_minor", {
      mode: "number",
    }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("wallet_entry_user_created_idx").on(table.userId, table.createdAt),
    index("wallet_entry_reference_idx").on(table.referenceId),
  ],
);

/** One materialized profile row per player and supported game. */
export const playerGameStats = pgTable(
  "player_game_stats",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    game: text("game").notNull(),
    played: integer("played").default(0).notNull(),
    won: integer("won").default(0).notNull(),
    wageredMinor: bigint("wagered_minor", { mode: "number" })
      .default(0)
      .notNull(),
    deltaMinor: bigint("delta_minor", { mode: "number" }).default(0).notNull(),
    maxWinMinor: bigint("max_win_minor", { mode: "number" })
      .default(0)
      .notNull(),
    maxLossMinor: bigint("max_loss_minor", { mode: "number" })
      .default(0)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.game] }),
    check("player_game_stats_played_nonnegative", sql`${table.played} >= 0`),
    check("player_game_stats_won_nonnegative", sql`${table.won} >= 0`),
    check(
      "player_game_stats_wagered_nonnegative",
      sql`${table.wageredMinor} >= 0`,
    ),
    check(
      "player_game_stats_max_win_nonnegative",
      sql`${table.maxWinMinor} >= 0`,
    ),
    check(
      "player_game_stats_max_loss_nonnegative",
      sql`${table.maxLossMinor} >= 0`,
    ),
  ],
);

/** Prevents a retried game closure from incrementing the profile twice. */
export const playerGameResult = pgTable(
  "player_game_result",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    game: text("game").notNull(),
    playId: text("play_id").notNull(),
    netMinor: bigint("net_minor", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.game, table.playId] }),
  ],
);

/**
 * Public identity of a player, shared by every social feature (friends today,
 * clubs later). Kept apart from the Better Auth user table.
 */
export const playerProfile = pgTable(
  "player_profile",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    friendCode: text("friend_code").notNull(),
    /** Who may open the profile at all. */
    visibility: text("visibility")
      .$type<Audience>()
      .default("public")
      .notNull(),
    /** Who may read the money: wagered, net and worst loss. */
    earningsVisibility: text("earnings_visibility")
      .$type<Audience>()
      .default("friends")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("player_profile_friend_code_idx").on(table.friendCode),
    check(
      "player_profile_friend_code_format",
      sql`${table.friendCode} ~ '^[A-Z0-9]{8}$'`,
    ),
    check(
      "player_profile_visibility_values",
      sql`${table.visibility} in ('public', 'friends', 'private')`,
    ),
    check(
      "player_profile_earnings_visibility_values",
      sql`${table.earningsVisibility} in ('public', 'friends', 'private')`,
    ),
  ],
);

/**
 * One row per pair of players: a pending request from requester to addressee,
 * or an accepted friendship. Declining or removing deletes the row.
 */
export const friendship = pgTable(
  "friendship",
  {
    id: text("id").primaryKey(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<"pending" | "accepted">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("friendship_pair_idx").on(
      sql`least(${table.requesterId}, ${table.addresseeId})`,
      sql`greatest(${table.requesterId}, ${table.addresseeId})`,
    ),
    index("friendship_requester_idx").on(table.requesterId, table.status),
    index("friendship_addressee_idx").on(table.addresseeId, table.status),
    check(
      "friendship_distinct_players",
      sql`${table.requesterId} <> ${table.addresseeId}`,
    ),
    check(
      "friendship_status_valid",
      sql`${table.status} in ('pending', 'accepted')`,
    ),
  ],
);

/**
 * The parrainage of a player: who brought them in, and with which code. One
 * row per filleul, written once at sign-up and never updated.
 */
export const referral = pgTable(
  "referral",
  {
    filleulId: text("filleul_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    parrainId: text("parrain_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The code as it was typed in, kept for the record. */
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("referral_parrain_idx").on(table.parrainId, table.createdAt),
    check(
      "referral_distinct_players",
      sql`${table.filleulId} <> ${table.parrainId}`,
    ),
  ],
);

/**
 * A parrain tier already settled. The row is written after the credits reach
 * the wallet, so a retry re-grants nothing and completes the record.
 */
export const referralReward = pgTable(
  "referral_reward",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    filleulId: text("filleul_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tier: integer("tier").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.filleulId, table.tier] }),
    check("referral_reward_tier_range", sql`${table.tier} between 1 and 5`),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Catalogue of the skins (docs/adr/0003-skins.md). The kinds are known to the
 * code, which draws each of them; the items themselves live here.
 */
export const cosmetic = pgTable(
  "cosmetic",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<CosmeticKind>().notNull(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    rarity: text("rarity").$type<CosmeticRarity>().default("common").notNull(),
    /** draft: hidden; active: listed; retired: kept by its owners only. */
    status: text("status").$type<CosmeticStatus>().default("draft").notNull(),
    /** Shown under a locked item, e.g. "Parraine un ami". */
    unlockHint: text("unlock_hint"),
    sortOrder: integer("sort_order").default(0).notNull(),
    /** Not for sale while null. No purchase reads these yet. */
    priceCredits: bigint("price_credits", { mode: "number" }),
    priceCents: integer("price_cents"),
    priceCurrency: text("price_currency"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Target of the equipment key, which also pins the kind.
    uniqueIndex("cosmetic_id_kind_idx").on(table.id, table.kind),
    check(
      "cosmetic_kind_values",
      sql`${table.kind} in ('card-back', 'profile-icon', 'chicken', 'mine-gem')`,
    ),
    check(
      "cosmetic_rarity_values",
      sql`${table.rarity} in ('common', 'rare', 'epic', 'legendary', 'exclusive')`,
    ),
    check(
      "cosmetic_status_values",
      sql`${table.status} in ('draft', 'active', 'retired')`,
    ),
    check(
      "cosmetic_price_credits_positive",
      sql`${table.priceCredits} is null or ${table.priceCredits} > 0`,
    ),
    check(
      "cosmetic_price_cents_positive",
      sql`${table.priceCents} is null or ${table.priceCents} > 0`,
    ),
    check(
      "cosmetic_price_currency_pair",
      sql`(${table.priceCents} is null) = (${table.priceCurrency} is null)`,
    ),
  ],
);

/**
 * The picture of a skin, apart from the catalogue so that listing items never
 * loads the bytes. The hash versions the asset URL.
 */
export const cosmeticAsset = pgTable(
  "cosmetic_asset",
  {
    cosmeticId: text("cosmetic_id")
      .primaryKey()
      .references(() => cosmetic.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    data: bytea("data").notNull(),
    hash: text("hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "cosmetic_asset_content_type_values",
      sql`${table.contentType} in ('image/svg+xml', 'image/png', 'image/webp')`,
    ),
  ],
);

/** Skins a player owns, and why. */
export const playerCosmetic = pgTable(
  "player_cosmetic",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // No cascade: a skin someone owns is retired, never deleted.
    cosmeticId: text("cosmetic_id")
      .notNull()
      .references(() => cosmetic.id),
    /** Why the player owns it, e.g. "parrainage-filleul". */
    source: text("source").$type<CosmeticSource>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cosmeticId] })],
);

/**
 * The skin a player wears for each kind; no row means the Classique. The keys
 * only let a player wear an item they own, under its own kind.
 */
export const playerEquippedCosmetic = pgTable(
  "player_equipped_cosmetic",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CosmeticKind>().notNull(),
    cosmeticId: text("cosmetic_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.kind] }),
    foreignKey({
      name: "player_equipped_cosmetic_owned_fk",
      columns: [table.userId, table.cosmeticId],
      foreignColumns: [playerCosmetic.userId, playerCosmetic.cosmeticId],
    }).onDelete("cascade"),
    foreignKey({
      name: "player_equipped_cosmetic_kind_fk",
      columns: [table.cosmeticId, table.kind],
      foreignColumns: [cosmetic.id, cosmetic.kind],
    }),
  ],
);

/** The release currently advertised to connected browsers. */
export const deploymentVersion = pgTable(
  "deployment_version",
  {
    id: integer("id").primaryKey(),
    codeRevision: text("code_revision").notNull(),
    databaseRevision: text("database_revision").notNull(),
  },
  (table) => [check("deployment_version_singleton", sql`${table.id} = 1`)],
);

export const authSchema = { user, session, account, verification };
export const schema = {
  ...authSchema,
  walletAccount,
  walletEntry,
  playerGameStats,
  playerGameResult,
  playerProfile,
  friendship,
  referral,
  referralReward,
  cosmetic,
  cosmeticAsset,
  playerCosmetic,
  playerEquippedCosmetic,
  deploymentVersion,
};

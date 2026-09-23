import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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

/**
 * Cosmetic items a player owns. The catalogue lives in the client
 * (src/lib/cosmetics.ts); only the ownership is stored.
 */
export const playerCosmetic = pgTable(
  "player_cosmetic",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cosmeticId: text("cosmetic_id").notNull(),
    /** Why the player owns it, e.g. "parrainage-filleul". */
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.cosmeticId] })],
);

export const authSchema = { user, session, account, verification };
export const schema = {
  ...authSchema,
  walletAccount,
  walletEntry,
  playerProfile,
  friendship,
  referral,
  referralReward,
  playerCosmetic,
};

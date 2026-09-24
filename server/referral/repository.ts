import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { SqlClient } from "@effect/sql/SqlClient";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import { PARRAINAGE_COSMETICS } from "../../src/lib/cosmetics";
import {
  REFERRAL_COSMETIC_TIER,
  REFERRAL_TIERS,
  REFERRAL_WELCOME_BONUS,
  nextTierAfter,
  tiersReachedBy,
  type Filleul,
  type ReferralOverview,
  type ReferralTier,
  type ReferralTierState,
} from "../../src/lib/referral";
import { normalizeFriendCode, type SocialPlayer } from "../../src/lib/social";
import { announceTiers } from "./events";
import { applyWalletOperations } from "../db/wallet";
import type { WalletOperation } from "../game-wallet";
import { grantCosmetics } from "../cosmetics/repository";
import {
  playerProfile,
  referral,
  referralReward,
  user,
  walletEntry,
} from "../db/schema";
import { befriendParrain, ensurePlayerProfile } from "../social/repository";

const MINOR_PER_CREDIT = 100;

/** A refusal the player can act on. */
export class ReferralError extends Data.TaggedError("ReferralError")<{
  readonly message: string;
  readonly status: 400 | 404 | 409;
}> {}

export class ReferralDatabaseError extends Data.TaggedError(
  "ReferralDatabaseError",
)<{ readonly cause: unknown }> {
  override get message() {
    return "Le parrainage est temporairement indisponible.";
  }
}

const mapDatabaseError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.mapError(effect, (cause) =>
    cause instanceof ReferralError || cause instanceof ReferralDatabaseError
      ? cause
      : new ReferralDatabaseError({ cause }),
  );

/** Parrainage credits are a grant: they never count as a wager in the stats. */
function grant(
  userId: string,
  operationId: string,
  reason: string,
  referenceId: string,
  amount: number,
  metadata?: Record<string, unknown>,
): WalletOperation {
  return {
    operationId,
    userId,
    delta: amount,
    game: "parrainage",
    kind: "grant",
    reason,
    referenceId,
    metadata,
  };
}

/**
 * Grants every tier reached by one filleul and not paid for yet. The wallet
 * operation ids are stable, so retries never credit the same tier twice.
 */
const settleTiers = (parrainId: string, filleulId: string, wagered: number) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const reached = tiersReachedBy(wagered);
    if (!reached.length) return [] as ReferralTier[];

    const paid = yield* db
      .select({ tier: referralReward.tier })
      .from(referralReward)
      .where(
        and(
          eq(referralReward.userId, parrainId),
          eq(referralReward.filleulId, filleulId),
        ),
      );
    const already = new Set(paid.map((row) => row.tier));
    const missing = reached.filter((tier) => !already.has(tier.tier));
    if (!missing.length) return [] as ReferralTier[];

    yield* applyWalletOperations(
      missing.map((tier) =>
        grant(
          parrainId,
          `parrainage:tier:${parrainId}:${filleulId}:${tier.tier}`,
          `tier-${tier.tier}`,
          filleulId,
          tier.reward,
          { filleulId, wagered, threshold: tier.wagered },
        ),
      ),
    );
    // Recorded once the credits landed: a failure here only costs a retry.
    yield* db
      .insert(referralReward)
      .values(
        missing.map((tier) => ({
          userId: parrainId,
          filleulId,
          tier: tier.tier,
          amount: tier.reward,
        })),
      )
      .onConflictDoNothing();
    if (missing.some((tier) => tier.tier === REFERRAL_COSMETIC_TIER))
      yield* grantCosmetics(
        parrainId,
        PARRAINAGE_COSMETICS,
        "parrainage-parrain",
      );
    announceTiers({ parrainId, filleulId, tiers: missing });
    return missing;
  });

/** The player owning a parrainage code, or null when nobody does. */
export const findParrainByCode = (input: string) =>
  Effect.gen(function* () {
    const code = normalizeFriendCode(input);
    if (!code) return null;
    const db = yield* PgDrizzle;
    const [row] = yield* db
      .select({ id: user.id, name: user.name })
      .from(playerProfile)
      .innerJoin(user, eq(user.id, playerProfile.userId))
      .where(eq(playerProfile.friendCode, code))
      .limit(1);
    return row ? { ...row, code } : null;
  }).pipe(mapDatabaseError);

export type ReferralRegistration = {
  readonly parrain: { readonly id: string; readonly name: string };
  readonly welcomeBonus: number;
  /** Tiers the parrain reaches thanks to this filleul. */
  readonly tiers: readonly ReferralTier[];
};

/**
 * Binds a new player to the parrain owning the code: the filleul gets their
 * welcome credits and cosmetics, the two become friends, and the parrain gets
 * every tier they now reach. Everything commits together, or nothing does.
 */
export const registerReferral = (filleulId: string, input: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const client = yield* SqlClient;
    const parrain = yield* findParrainByCode(input);
    if (!parrain)
      return yield* new ReferralError({
        message: "Aucun joueur n’a ce code de parrainage.",
        status: 404,
      });
    if (parrain.id === filleulId)
      return yield* new ReferralError({
        message: "Vous ne pouvez pas être votre propre parrain.",
        status: 400,
      });

    return yield* client.withTransaction(
      Effect.gen(function* () {
        const inserted = yield* db
          .insert(referral)
          .values({ filleulId, parrainId: parrain.id, code: parrain.code })
          .onConflictDoNothing()
          .returning({ filleulId: referral.filleulId });
        if (!inserted.length)
          return yield* new ReferralError({
            message: "Vous avez déjà un parrain.",
            status: 409,
          });

        yield* applyWalletOperations([
          grant(
            filleulId,
            `parrainage:welcome:${filleulId}`,
            "welcome-bonus",
            parrain.id,
            REFERRAL_WELCOME_BONUS,
            { code: parrain.code },
          ),
        ]);
        yield* grantCosmetics(
          filleulId,
          PARRAINAGE_COSMETICS,
          "parrainage-filleul",
        );
        // A parrain and their filleul already know each other: no request.
        yield* befriendParrain(parrain.id, filleulId);
        return {
          parrain: { id: parrain.id, name: parrain.name },
          welcomeBonus: REFERRAL_WELCOME_BONUS,
          tiers: [],
        } satisfies ReferralRegistration;
      }),
    );
  }).pipe(mapDatabaseError);

/** Rounds played and credits wagered by several players, in one query. */
const activityOf = (ids: readonly string[]) =>
  Effect.gen(function* () {
    const activity = new Map<string, { played: number; wagered: number }>();
    if (!ids.length) return activity;
    const db = yield* PgDrizzle;
    const rows = yield* db
      .select({
        userId: walletEntry.userId,
        played:
          sql<number>`count(distinct ${walletEntry.referenceId}) filter (where ${walletEntry.kind} in ('wager', 'buy-in'))`.mapWith(
            Number,
          ),
        wagered:
          sql<number>`coalesce(sum(-${walletEntry.amountMinor}) filter (where ${walletEntry.kind} in ('wager', 'additional-wager', 'buy-in')), 0)`.mapWith(
            Number,
          ),
      })
      .from(walletEntry)
      .where(
        and(
          inArray(walletEntry.userId, [...ids]),
          inArray(walletEntry.kind, ["wager", "additional-wager", "buy-in"]),
        ),
      )
      .groupBy(walletEntry.userId);
    for (const row of rows)
      activity.set(row.userId, {
        played: row.played,
        wagered: row.wagered / MINOR_PER_CREDIT,
      });
    return activity;
  });

/**
 * Settles the tiers one filleul just unlocked by playing. The club calls this
 * after the filleul's wagers are committed, so the parrain is paid while they
 * play instead of waiting for someone to open the parrainage panel.
 */
export const settleFilleulTiers = (filleulId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const [row] = yield* db
      .select({ parrainId: referral.parrainId })
      .from(referral)
      .where(eq(referral.filleulId, filleulId))
      .limit(1);
    if (!row) return [] as readonly ReferralTier[];
    const activity = yield* activityOf([filleulId]);
    return yield* settleTiers(
      row.parrainId,
      filleulId,
      activity.get(filleulId)?.wagered ?? 0,
    );
  }).pipe(mapDatabaseError);

export type ReferralDeps = {
  /** Whether the player has at least one live connection to the club. */
  readonly isOnline: (userId: string) => boolean;
};

/**
 * The parrainage panel of a player: their code, their parrain, their filleuls
 * and the state of the five tiers. Tiers are settled on read as well, so a
 * grant interrupted earlier completes the next time the panel opens.
 */
export const referralOverview = (userId: string, deps: ReferralDeps) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const code = yield* ensurePlayerProfile(userId);

    const [parrainRow] = yield* db
      .select({
        id: user.id,
        name: user.name,
        friendCode: playerProfile.friendCode,
        since: referral.createdAt,
      })
      .from(referral)
      .innerJoin(user, eq(user.id, referral.parrainId))
      .leftJoin(playerProfile, eq(playerProfile.userId, referral.parrainId))
      .where(eq(referral.filleulId, userId))
      .limit(1);

    const filleulRows = yield* db
      .select({
        id: user.id,
        name: user.name,
        friendCode: playerProfile.friendCode,
        joinedAt: referral.createdAt,
      })
      .from(referral)
      .innerJoin(user, eq(user.id, referral.filleulId))
      .leftJoin(playerProfile, eq(playerProfile.userId, referral.filleulId))
      .where(eq(referral.parrainId, userId))
      .orderBy(desc(referral.createdAt));

    const activity = yield* activityOf(filleulRows.map((row) => row.id));
    for (const row of filleulRows)
      yield* settleTiers(userId, row.id, activity.get(row.id)?.wagered ?? 0);

    const rewards = yield* db
      .select()
      .from(referralReward)
      .where(eq(referralReward.userId, userId));
    const granted = new Map<string, typeof rewards>();
    for (const reward of rewards) {
      const rows = granted.get(reward.filleulId) ?? [];
      rows.push(reward);
      granted.set(reward.filleulId, rows);
    }
    const filleuls = filleulRows.map((row): Filleul => {
      const wagered = activity.get(row.id)?.wagered ?? 0;
      const paid = new Map(
        (granted.get(row.id) ?? []).map((reward) => [reward.tier, reward]),
      );
      return {
        id: row.id,
        name: row.name,
        friendCode: row.friendCode,
        joinedAt: row.joinedAt.toISOString(),
        online: deps.isOnline(row.id),
        played: activity.get(row.id)?.played ?? 0,
        wagered,
        tiers: REFERRAL_TIERS.map((tier): ReferralTierState => ({
          ...tier,
          reached: paid.has(tier.tier),
          grantedAt: paid.get(tier.tier)?.createdAt.toISOString() ?? null,
        })),
        nextTier: nextTierAfter(wagered),
      };
    });

    return {
      code,
      parrain: parrainRow
        ? ({
            id: parrainRow.id,
            name: parrainRow.name,
            friendCode: parrainRow.friendCode,
            since: parrainRow.since.toISOString(),
          } satisfies SocialPlayer & { since: string })
        : null,
      filleuls,
      earned: rewards.reduce((total, row) => total + row.amount, 0),
    } satisfies ReferralOverview;
  }).pipe(mapDatabaseError);

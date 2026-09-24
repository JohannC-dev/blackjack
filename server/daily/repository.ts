import { randomInt } from "node:crypto";
import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { SqlClient } from "@effect/sql/SqlClient";
import { and, eq, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import {
  SKIN_CONVERSION,
  WHEEL_SEGMENTS,
  WHEEL_TOTAL_WEIGHT,
  dayKeyAt,
  milestoneAt,
  wheelMultiplierFor,
  wheelSegmentFor,
  type DailySpin,
  type DailyUpdate,
  type MilestoneReward,
  type StreakMilestone,
} from "../../src/lib/daily";
import { grantCosmetics } from "../cosmetics/repository";
import { cosmetic, dailyStreak, playerCosmetic } from "../db/schema";
import { applyWalletOperations } from "../db/wallet";
import type { WalletOperation } from "../game-wallet";
import { advanceStreak, statusOf, type StreakRow } from "./streak";

/** A refusal the player can act on. */
export class DailyError extends Data.TaggedError("DailyError")<{
  readonly message: string;
}> {}

export class DailyDatabaseError extends Data.TaggedError("DailyDatabaseError")<{
  readonly cause: unknown;
}> {
  override get message() {
    return "La série quotidienne est temporairement indisponible.";
  }
}

const mapDatabaseError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.mapError(effect, (cause) =>
    cause instanceof DailyError || cause instanceof DailyDatabaseError
      ? cause
      : new DailyDatabaseError({ cause }),
  );

const columns = {
  current: dailyStreak.current,
  best: dailyStreak.best,
  lastDay: dailyStreak.lastDay,
  runStartedDay: dailyStreak.runStartedDay,
  lastSpinDay: dailyStreak.lastSpinDay,
};

/** Streak credits are a grant: they never count as a wager in the stats. */
function grant(
  userId: string,
  operationId: string,
  reason: string,
  amount: number,
  metadata: Record<string, unknown>,
): WalletOperation {
  return {
    operationId,
    userId,
    delta: amount,
    game: "casino",
    kind: "grant",
    reason,
    referenceId: userId,
    metadata,
  };
}

/** The player's row, created if needed and locked until the commit. */
const lockStreak = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const [row] = yield* db
      .insert(dailyStreak)
      .values({ userId })
      .onConflictDoUpdate({
        target: dailyStreak.userId,
        set: { userId: sql`excluded.user_id` },
      })
      .returning(columns);
    return row as StreakRow;
  });

/**
 * Pays a milestone. Its skin is given once for good: a player who already
 * owns it gets credits after its rarity instead. The operation id holds the
 * run, so a new run pays again and a retry never does.
 */
const payMilestone = (
  userId: string,
  runStartedDay: string,
  milestone: StreakMilestone,
) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    let converted = 0;
    let granted: MilestoneReward["cosmetic"] = null;
    if (milestone.cosmeticId) {
      const [item] = yield* db
        .select({
          name: cosmetic.name,
          rarity: cosmetic.rarity,
          status: cosmetic.status,
          owner: playerCosmetic.userId,
        })
        .from(cosmetic)
        .leftJoin(
          playerCosmetic,
          and(
            eq(playerCosmetic.cosmeticId, cosmetic.id),
            eq(playerCosmetic.userId, userId),
          ),
        )
        .where(eq(cosmetic.id, milestone.cosmeticId));
      if (item && item.status === "active" && !item.owner) {
        yield* grantCosmetics(userId, [milestone.cosmeticId], "streak");
        granted = { id: milestone.cosmeticId, name: item.name };
      } else converted = SKIN_CONVERSION[item?.rarity ?? "rare"];
    }
    const amount = milestone.credits + converted;
    if (amount)
      yield* applyWalletOperations([
        grant(
          userId,
          `daily:streak:${userId}:${runStartedDay}:${milestone.day}`,
          `streak-${milestone.day}`,
          amount,
          {
            day: milestone.day,
            credits: milestone.credits,
            converted,
            cosmeticId: milestone.cosmeticId,
          },
        ),
      ]);
    return {
      day: milestone.day,
      credits: milestone.credits,
      cosmetic: granted,
      converted,
      wheelMultiplier: milestone.wheelMultiplier,
    } satisfies MilestoneReward;
  });

/** Counts the current club day on a locked row, paying what it reaches. */
const countDay = (userId: string, row: StreakRow, now: number) =>
  Effect.gen(function* () {
    const next = advanceStreak(row, dayKeyAt(now));
    if (!next.counted) return { row, checkIn: null };
    const milestone = milestoneAt(next.row.current);
    const reward = milestone
      ? yield* payMilestone(userId, next.row.runStartedDay!, milestone)
      : null;
    return {
      row: next.row,
      checkIn: { counted: true, lost: next.lost, milestone: reward },
    };
  });

const saveStreak = (userId: string, row: StreakRow) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    yield* db
      .update(dailyStreak)
      .set({ ...row, updatedAt: sql`now()` })
      .where(eq(dailyStreak.userId, userId));
  });

/**
 * Counts the club day for a connecting player. Once the day is counted, a
 * reconnection costs one read and no transaction.
 */
export const checkInDaily = (userId: string, now: number) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const client = yield* SqlClient;
    const [known] = yield* db
      .select(columns)
      .from(dailyStreak)
      .where(eq(dailyStreak.userId, userId));
    if (known?.lastDay === dayKeyAt(now))
      return {
        status: statusOf(known as StreakRow, now),
        checkIn: null,
      } satisfies DailyUpdate;

    return yield* client.withTransaction(
      Effect.gen(function* () {
        const counted = yield* countDay(userId, yield* lockStreak(userId), now);
        if (counted.checkIn) yield* saveStreak(userId, counted.row);
        return {
          status: statusOf(counted.row, now),
          checkIn: counted.checkIn,
        } satisfies DailyUpdate;
      }),
    );
  }).pipe(mapDatabaseError);

/**
 * The free spin of the club day. The prize is drawn and credited before the
 * reply: the client only turns the wheel to it.
 */
export const spinDailyWheel = (userId: string, now: number) =>
  Effect.gen(function* () {
    const client = yield* SqlClient;
    return yield* client.withTransaction(
      Effect.gen(function* () {
        const day = dayKeyAt(now);
        // A player connected across 08:00 spins on a day not counted yet.
        const counted = yield* countDay(userId, yield* lockStreak(userId), now);
        if (counted.row.lastSpinDay === day)
          return yield* new DailyError({
            message: "La roue a déjà tourné aujourd’hui. Revenez à 8 h.",
          });
        const multiplier = wheelMultiplierFor(counted.row.current);
        const segment = wheelSegmentFor(randomInt(WHEEL_TOTAL_WEIGHT));
        const amount = Math.round(WHEEL_SEGMENTS[segment]!.amount * multiplier);
        yield* applyWalletOperations([
          grant(userId, `daily:wheel:${userId}:${day}`, "daily-wheel", amount, {
            day,
            segment,
            multiplier,
          }),
        ]);
        const row = { ...counted.row, lastSpinDay: day };
        yield* saveStreak(userId, row);
        return {
          spin: {
            segment,
            multiplier,
            amount,
            status: statusOf(row, now),
          } satisfies DailySpin,
          checkIn: counted.checkIn,
        };
      }),
    );
  }).pipe(mapDatabaseError);

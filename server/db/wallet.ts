import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { SqlClient } from "@effect/sql/SqlClient";
import { and, eq, gte, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import { walletAccount, walletEntry } from "./schema";

const MINOR_PER_CREDIT = 100;
const INITIAL_BALANCE_MINOR = 200_000;

export type GameId =
  "blackjack" | "poker" | "tower" | "mines" | "roulette" | "system";

export type WalletSnapshot = {
  readonly balance: number;
  readonly version: number;
};

export class WalletDatabaseError extends Data.TaggedError(
  "WalletDatabaseError",
)<{
  readonly cause: unknown;
}> {
  override get message() {
    return "Le portefeuille est temporairement indisponible.";
  }
}

export class InsufficientBalance extends Data.TaggedError(
  "InsufficientBalance",
)<{}> {
  override get message() {
    return "Votre solde est insuffisant.";
  }
}

function toMinor(credits: number) {
  const minor = Math.round(credits * MINOR_PER_CREDIT);
  if (!Number.isSafeInteger(minor))
    throw new Error("Montant de portefeuille invalide.");
  return minor;
}

function fromMinor(minor: number) {
  return minor / MINOR_PER_CREDIT;
}

const mapDatabaseError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.mapError(effect, (cause) =>
    cause instanceof InsufficientBalance || cause instanceof WalletDatabaseError
      ? cause
      : new WalletDatabaseError({ cause }),
  );

export const getOrCreateWallet = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    yield* db
      .insert(walletAccount)
      .values({ userId, balanceMinor: INITIAL_BALANCE_MINOR })
      .onConflictDoNothing();
    const [row] = yield* db
      .select({
        balanceMinor: walletAccount.balanceMinor,
        version: walletAccount.version,
      })
      .from(walletAccount)
      .where(eq(walletAccount.userId, userId))
      .limit(1);
    if (!row) return yield* Effect.die("Wallet row missing after insert");
    return {
      balance: fromMinor(row.balanceMinor),
      version: row.version,
    } satisfies WalletSnapshot;
  }).pipe(mapDatabaseError);

export const readWallet = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const [row] = yield* db
      .select({
        balanceMinor: walletAccount.balanceMinor,
        version: walletAccount.version,
      })
      .from(walletAccount)
      .where(eq(walletAccount.userId, userId))
      .limit(1);
    if (!row) return yield* getOrCreateWallet(userId);
    return {
      balance: fromMinor(row.balanceMinor),
      version: row.version,
    } satisfies WalletSnapshot;
  }).pipe(mapDatabaseError);

export type ApplyWalletDelta = {
  readonly operationId: string;
  readonly userId: string;
  readonly delta: number;
  readonly game: GameId;
  readonly reason: string;
  readonly referenceId?: string;
  readonly metadata?: Record<string, unknown>;
};

export const applyWalletDelta = (input: ApplyWalletDelta) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const client = yield* SqlClient;
    const deltaMinor = toMinor(input.delta);

    return yield* client.withTransaction(
      Effect.gen(function* () {
        yield* db
          .insert(walletAccount)
          .values({
            userId: input.userId,
            balanceMinor: INITIAL_BALANCE_MINOR,
          })
          .onConflictDoNothing();

        const [existing] = yield* db
          .select({
            balanceAfterMinor: walletEntry.balanceAfterMinor,
          })
          .from(walletEntry)
          .where(eq(walletEntry.operationId, input.operationId))
          .limit(1);
        if (existing)
          return {
            balance: fromMinor(existing.balanceAfterMinor),
            version: 0,
          } satisfies WalletSnapshot;

        const condition =
          deltaMinor < 0
            ? and(
                eq(walletAccount.userId, input.userId),
                gte(walletAccount.balanceMinor, -deltaMinor),
              )
            : eq(walletAccount.userId, input.userId);

        const [updated] = yield* db
          .update(walletAccount)
          .set({
            balanceMinor: sql`${walletAccount.balanceMinor} + ${deltaMinor}`,
            version: sql`${walletAccount.version} + 1`,
            updatedAt: new Date(),
          })
          .where(condition)
          .returning({
            balanceMinor: walletAccount.balanceMinor,
            version: walletAccount.version,
          });

        if (!updated) return yield* new InsufficientBalance();

        yield* db.insert(walletEntry).values({
          operationId: input.operationId,
          userId: input.userId,
          game: input.game,
          reason: input.reason,
          referenceId: input.referenceId,
          amountMinor: deltaMinor,
          balanceAfterMinor: updated.balanceMinor,
          metadata: input.metadata ?? null,
        });

        return {
          balance: fromMinor(updated.balanceMinor),
          version: updated.version,
        } satisfies WalletSnapshot;
      }),
    );
  }).pipe(mapDatabaseError);

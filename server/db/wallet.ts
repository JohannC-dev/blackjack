import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { SqlClient } from "@effect/sql/SqlClient";
import { and, eq, gte, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import type { GameResult, WalletOperation } from "../game-wallet";
import { INITIAL_CREDIT_BALANCE } from "../../src/lib/chips";
import { walletAccount, walletEntry } from "./schema";
import { applyGameResult, applyWalletStatDelta } from "./game-stats";
import { fromMinor, toMinor, MINOR_PER_CREDIT } from "./money";

const INITIAL_BALANCE_MINOR = INITIAL_CREDIT_BALANCE * MINOR_PER_CREDIT;

export type WalletSnapshot = {
  readonly balance: number;
  readonly version: number;
};

export type WalletResult = WalletSnapshot & { readonly userId: string };

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

const applyOperation = (input: WalletOperation) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const deltaMinor = toMinor(input.delta);

    yield* db
      .insert(walletAccount)
      .values({
        userId: input.userId,
        balanceMinor: INITIAL_BALANCE_MINOR,
      })
      .onConflictDoNothing();

    const [existing] = yield* db
      .select({
        userId: walletEntry.userId,
        amountMinor: walletEntry.amountMinor,
        game: walletEntry.game,
        kind: walletEntry.kind,
        reason: walletEntry.reason,
        referenceId: walletEntry.referenceId,
        metadata: walletEntry.metadata,
      })
      .from(walletEntry)
      .where(eq(walletEntry.operationId, input.operationId))
      .limit(1);
    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.amountMinor !== deltaMinor ||
        existing.game !== input.game ||
        existing.kind !== input.kind ||
        existing.reason !== input.reason ||
        existing.referenceId !== input.referenceId ||
        JSON.stringify(existing.metadata) !==
          JSON.stringify(input.metadata ?? null)
      )
        return yield* Effect.die(
          "Wallet operation id reused with different data",
        );
      return;
    }

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
      .returning({ balanceMinor: walletAccount.balanceMinor });

    if (!updated) return yield* new InsufficientBalance();

    yield* db.insert(walletEntry).values({
      operationId: input.operationId,
      userId: input.userId,
      game: input.game,
      kind: input.kind,
      reason: input.reason,
      referenceId: input.referenceId,
      amountMinor: deltaMinor,
      balanceAfterMinor: updated.balanceMinor,
      metadata: input.metadata ?? null,
    });
    yield* applyWalletStatDelta(input);
  });

export const applyWalletOperations = (
  operations: readonly WalletOperation[],
  gameResults: readonly GameResult[] = [],
) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const client = yield* SqlClient;
    const grouped = new Map<string, WalletOperation[]>();
    for (const operation of operations) {
      const userOperations = grouped.get(operation.userId) ?? [];
      userOperations.push(operation);
      grouped.set(operation.userId, userOperations);
    }
    const ordered = [...grouped.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return yield* client.withTransaction(
      Effect.gen(function* () {
        for (const [, userOperations] of ordered)
          for (const operation of userOperations)
            yield* applyOperation(operation);
        for (const result of gameResults) yield* applyGameResult(result);

        const results: WalletResult[] = [];
        for (const [userId] of ordered) {
          const [row] = yield* db
            .select({
              balanceMinor: walletAccount.balanceMinor,
              version: walletAccount.version,
            })
            .from(walletAccount)
            .where(eq(walletAccount.userId, userId))
            .limit(1);
          if (!row) return yield* Effect.die("Wallet row missing after update");
          results.push({
            userId,
            balance: fromMinor(row.balanceMinor),
            version: row.version,
          });
        }
        return results;
      }),
    );
  }).pipe(mapDatabaseError);

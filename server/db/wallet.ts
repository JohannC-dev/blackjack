import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { SqlClient } from "@effect/sql/SqlClient";
import { eq, inArray } from "drizzle-orm";
import { Data, Effect } from "effect";
import type { GameResult, WalletOperation } from "../game-wallet";
import { INITIAL_CREDIT_BALANCE } from "../../src/lib/chips";
import { walletAccount, walletEntry } from "./schema";
import { applyGameStats } from "./game-stats";
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

type RecordedEntry = {
  userId: string;
  amountMinor: number;
  game: string;
  kind: string;
  reason: string;
  referenceId: string | null;
  metadata: unknown;
};

function sameEntry(entry: RecordedEntry, operation: WalletOperation) {
  return (
    entry.userId === operation.userId &&
    entry.amountMinor === toMinor(operation.delta) &&
    entry.game === operation.game &&
    entry.kind === operation.kind &&
    entry.reason === operation.reason &&
    entry.referenceId === operation.referenceId &&
    JSON.stringify(entry.metadata) ===
      JSON.stringify(operation.metadata ?? null)
  );
}

/**
 * Applies a batch in a fixed number of statements, however many operations
 * it holds: the accounts are locked, the new balances worked out here, then
 * written back at once. Each statement is a round trip to the database, and a
 * Plinko salvo of ten balls used to need about a hundred and fifty of them.
 */
export const applyWalletOperations = (
  operations: readonly WalletOperation[],
  gameResults: readonly GameResult[] = [],
) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const client = yield* SqlClient;
    // Grouped by player, in a stable order: two batches always lock the same
    // accounts in the same order, and a player's entries keep their sequence.
    const ordered = [...operations].sort((left, right) =>
      left.userId.localeCompare(right.userId),
    );
    const userIds = [...new Set(ordered.map((operation) => operation.userId))];

    return yield* client.withTransaction(
      Effect.gen(function* () {
        const accounts = new Map<
          string,
          { balanceMinor: number; version: number }
        >();
        if (userIds.length) {
          yield* db
            .insert(walletAccount)
            .values(
              userIds.map((userId) => ({
                userId,
                balanceMinor: INITIAL_BALANCE_MINOR,
              })),
            )
            .onConflictDoNothing();
          // Held until the commit: no other batch moves these balances between
          // the read below and the write that follows it.
          const rows = yield* db
            .select({
              userId: walletAccount.userId,
              balanceMinor: walletAccount.balanceMinor,
              version: walletAccount.version,
            })
            .from(walletAccount)
            .where(inArray(walletAccount.userId, userIds))
            .orderBy(walletAccount.userId)
            .for("update");
          for (const row of rows)
            accounts.set(row.userId, {
              balanceMinor: row.balanceMinor,
              version: row.version,
            });
        }

        // A retried operation is already in the ledger: it must carry the same
        // data, and is not applied twice.
        const recorded = new Map<string, RecordedEntry>();
        if (ordered.length) {
          const rows = yield* db
            .select({
              operationId: walletEntry.operationId,
              userId: walletEntry.userId,
              amountMinor: walletEntry.amountMinor,
              game: walletEntry.game,
              kind: walletEntry.kind,
              reason: walletEntry.reason,
              referenceId: walletEntry.referenceId,
              metadata: walletEntry.metadata,
            })
            .from(walletEntry)
            .where(
              inArray(
                walletEntry.operationId,
                ordered.map((operation) => operation.operationId),
              ),
            );
          for (const row of rows) recorded.set(row.operationId, row);
        }

        const entries: (typeof walletEntry.$inferInsert)[] = [];
        const applied: WalletOperation[] = [];
        const changed = new Set<string>();
        for (const operation of ordered) {
          const existing = recorded.get(operation.operationId);
          if (existing) {
            if (!sameEntry(existing, operation))
              return yield* Effect.die(
                "Wallet operation id reused with different data",
              );
            continue;
          }
          const account = accounts.get(operation.userId);
          if (!account)
            return yield* Effect.die("Wallet row missing after insert");
          const deltaMinor = toMinor(operation.delta);
          if (account.balanceMinor + deltaMinor < 0)
            return yield* new InsufficientBalance();
          account.balanceMinor += deltaMinor;
          account.version += 1;
          changed.add(operation.userId);
          const entry = {
            operationId: operation.operationId,
            userId: operation.userId,
            game: operation.game,
            kind: operation.kind,
            reason: operation.reason,
            referenceId: operation.referenceId,
            amountMinor: deltaMinor,
            balanceAfterMinor: account.balanceMinor,
            metadata: operation.metadata ?? null,
          };
          entries.push(entry);
          applied.push(operation);
          recorded.set(operation.operationId, entry);
        }

        for (const userId of changed) {
          const account = accounts.get(userId)!;
          yield* db
            .update(walletAccount)
            .set({
              balanceMinor: account.balanceMinor,
              version: account.version,
              updatedAt: new Date(),
            })
            .where(eq(walletAccount.userId, userId));
        }
        if (entries.length) yield* db.insert(walletEntry).values(entries);
        yield* applyGameStats(applied, gameResults);

        return userIds.map((userId) => {
          const account = accounts.get(userId)!;
          return {
            userId,
            balance: fromMinor(account.balanceMinor),
            version: account.version,
          } satisfies WalletResult;
        });
      }),
    );
  }).pipe(mapDatabaseError);

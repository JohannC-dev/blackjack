import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { GameResult, WalletOperation } from "../game-wallet";
import { toMinor } from "./money";
import { playerGameResult, playerGameStats } from "./schema";

const GAMES = new Set(["blackjack", "roulette", "poker", "tower", "mines"]);

/** Called only after the corresponding wallet entry has been inserted. */
export const applyWalletStatDelta = (operation: WalletOperation) =>
  Effect.gen(function* () {
    if (!GAMES.has(operation.game) || operation.kind === "grant") return;
    if (
      operation.game === "blackjack" &&
      operation.reason.startsWith("gamble-")
    )
      return;
    const db = yield* PgDrizzle;
    const deltaMinor = toMinor(operation.delta);
    const wageredDelta =
      operation.kind === "wager" ||
      operation.kind === "additional-wager" ||
      operation.kind === "buy-in"
        ? -deltaMinor
        : operation.kind === "refund"
          ? -deltaMinor
          : 0;
    yield* db
      .insert(playerGameStats)
      .values({
        userId: operation.userId,
        game: operation.game,
      })
      .onConflictDoNothing();
    yield* db
      .update(playerGameStats)
      .set({
        wageredMinor: sql`${playerGameStats.wageredMinor} + ${wageredDelta}`,
        deltaMinor: sql`${playerGameStats.deltaMinor} + ${deltaMinor}`,
      })
      .where(
        and(
          eq(playerGameStats.userId, operation.userId),
          eq(playerGameStats.game, operation.game),
        ),
      );
  });

/** The marker makes a retried closure safe, including closures with no payout. */
export const applyGameResult = (result: GameResult) =>
  Effect.gen(function* () {
    if (!GAMES.has(result.game)) return;
    const db = yield* PgDrizzle;
    const netMinor = toMinor(result.net);
    const inserted = yield* db
      .insert(playerGameResult)
      .values({
        userId: result.userId,
        game: result.game,
        playId: result.playId,
        netMinor,
      })
      .onConflictDoNothing()
      .returning({ playId: playerGameResult.playId });
    if (!inserted.length) {
      const [existing] = yield* db
        .select({ netMinor: playerGameResult.netMinor })
        .from(playerGameResult)
        .where(
          and(
            eq(playerGameResult.userId, result.userId),
            eq(playerGameResult.game, result.game),
            eq(playerGameResult.playId, result.playId),
          ),
        )
        .limit(1);
      if (existing?.netMinor !== netMinor)
        return yield* Effect.die("Game result id reused with different net");
      return;
    }
    yield* db
      .insert(playerGameStats)
      .values({
        userId: result.userId,
        game: result.game,
      })
      .onConflictDoNothing();
    yield* db
      .update(playerGameStats)
      .set({
        played: sql`${playerGameStats.played} + 1`,
        maxWinMinor: sql`greatest(${playerGameStats.maxWinMinor}, ${Math.max(0, netMinor)})`,
        maxLossMinor: sql`greatest(${playerGameStats.maxLossMinor}, ${Math.max(0, -netMinor)})`,
      })
      .where(
        and(
          eq(playerGameStats.userId, result.userId),
          eq(playerGameStats.game, result.game),
        ),
      );
  });

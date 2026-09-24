import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { and, eq, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { GameResult, WalletOperation } from "../game-wallet";
import { toMinor } from "./money";
import { playerGameResult, playerGameStats } from "./schema";

const GAMES = new Set([
  "blackjack",
  "roulette",
  "poker",
  "tower",
  "mines",
  "chicken",
  "plinko",
]);

const WAGER_KINDS = new Set(["wager", "additional-wager", "buy-in", "refund"]);

type StatTotals = typeof playerGameStats.$inferInsert & {
  played: number;
  wageredMinor: number;
  deltaMinor: number;
  maxWinMinor: number;
  maxLossMinor: number;
};

const playKey = (play: { userId: string; game: string; playId: string }) =>
  `${play.userId}\0${play.game}\0${play.playId}`;

/**
 * Records the closed plays and folds them, with the wallet entries the batch
 * has just inserted, into one stats row per player and game: two or three
 * statements for the whole batch rather than a few per entry. A play already
 * recorded is a retried closure: it must carry the same net and counts once.
 */
export const applyGameStats = (
  entries: readonly WalletOperation[],
  results: readonly GameResult[],
) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const totals = new Map<string, StatTotals>();
    const totalsFor = (userId: string, game: string) => {
      const key = `${userId}\0${game}`;
      let total = totals.get(key);
      if (!total) {
        total = {
          userId,
          game,
          played: 0,
          wageredMinor: 0,
          deltaMinor: 0,
          maxWinMinor: 0,
          maxLossMinor: 0,
        };
        totals.set(key, total);
      }
      return total;
    };

    for (const entry of entries) {
      if (!GAMES.has(entry.game) || entry.kind === "grant") continue;
      if (entry.game === "blackjack" && entry.reason.startsWith("gamble-"))
        continue;
      const deltaMinor = toMinor(entry.delta);
      const total = totalsFor(entry.userId, entry.game);
      total.deltaMinor += deltaMinor;
      if (WAGER_KINDS.has(entry.kind)) total.wageredMinor -= deltaMinor;
    }

    const plays = results
      .filter((result) => GAMES.has(result.game))
      .map((result) => ({
        userId: result.userId,
        game: result.game,
        playId: result.playId,
        netMinor: toMinor(result.net),
      }));
    if (plays.length) {
      const inserted = yield* db
        .insert(playerGameResult)
        .values(plays)
        .onConflictDoNothing()
        .returning({
          userId: playerGameResult.userId,
          game: playerGameResult.game,
          playId: playerGameResult.playId,
        });
      const fresh = new Set(inserted.map(playKey));
      const replayed = plays.filter((play) => !fresh.has(playKey(play)));
      if (replayed.length) {
        const recorded = yield* db
          .select({
            userId: playerGameResult.userId,
            game: playerGameResult.game,
            playId: playerGameResult.playId,
            netMinor: playerGameResult.netMinor,
          })
          .from(playerGameResult)
          .where(
            or(
              ...replayed.map((play) =>
                and(
                  eq(playerGameResult.userId, play.userId),
                  eq(playerGameResult.game, play.game),
                  eq(playerGameResult.playId, play.playId),
                ),
              ),
            ),
          );
        const nets = new Map(
          recorded.map((row) => [playKey(row), row.netMinor]),
        );
        if (replayed.some((play) => nets.get(playKey(play)) !== play.netMinor))
          return yield* Effect.die("Game result id reused with different net");
      }
      for (const play of plays) {
        if (!fresh.has(playKey(play))) continue;
        const total = totalsFor(play.userId, play.game);
        total.played += 1;
        total.maxWinMinor = Math.max(total.maxWinMinor, play.netMinor);
        total.maxLossMinor = Math.max(total.maxLossMinor, -play.netMinor);
      }
    }

    if (!totals.size) return;
    yield* db
      .insert(playerGameStats)
      .values([...totals.values()])
      .onConflictDoUpdate({
        target: [playerGameStats.userId, playerGameStats.game],
        set: {
          played: sql`${playerGameStats.played} + excluded.played`,
          wageredMinor: sql`${playerGameStats.wageredMinor} + excluded.wagered_minor`,
          deltaMinor: sql`${playerGameStats.deltaMinor} + excluded.delta_minor`,
          maxWinMinor: sql`greatest(${playerGameStats.maxWinMinor}, excluded.max_win_minor)`,
          maxLossMinor: sql`greatest(${playerGameStats.maxLossMinor}, excluded.max_loss_minor)`,
        },
      });
  });

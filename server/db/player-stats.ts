import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import {
  isStatGame,
  STAT_GAMES,
  type GameStats,
  type PlayerStats,
  type StatGame,
  type StatsSummary,
} from "../../src/lib/social";
import { fromMinor } from "./money";
import { playerGameResult, playerGameStats } from "./schema";

/**
 * Everything the profile reports, earnings included. Hiding them is the
 * caller's job: this module does not know who is watching.
 */
export const statsFor = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const [totals, wins] = yield* Effect.all(
      [
        db
          .select({
            game: playerGameStats.game,
            played: playerGameStats.played,
            wageredMinor: playerGameStats.wageredMinor,
            deltaMinor: playerGameStats.deltaMinor,
            maxWinMinor: playerGameStats.maxWinMinor,
            maxLossMinor: playerGameStats.maxLossMinor,
          })
          .from(playerGameStats)
          .where(eq(playerGameStats.userId, userId)),
        // The per-game counters have no win column: the results carry it.
        db
          .select({
            game: playerGameResult.game,
            won: sql<number>`count(*) filter (where ${playerGameResult.netMinor} > 0)`.mapWith(
              Number,
            ),
          })
          .from(playerGameResult)
          .where(eq(playerGameResult.userId, userId))
          .groupBy(playerGameResult.game),
      ],
      { concurrency: "unbounded" },
    );

    const wonByGame = new Map(wins.map((row) => [row.game, row.won]));
    const games: GameStats[] = [];
    for (const row of totals) {
      // A game dropped from the catalogue keeps its rows but leaves the profile.
      if (!isStatGame(row.game) || row.played === 0) continue;
      games.push({
        game: row.game,
        played: row.played,
        won: wonByGame.get(row.game) ?? 0,
        bestWin: fromMinor(row.maxWinMinor),
        earnings: {
          wagered: fromMinor(row.wageredMinor),
          net: fromMinor(row.deltaMinor),
          worstLoss: fromMinor(row.maxLossMinor),
        },
      });
    }

    games.sort(
      (a, b) => STAT_GAMES.indexOf(a.game) - STAT_GAMES.indexOf(b.game),
    );

    let favourite: StatGame | null = null;
    let mostPlayed = 0;
    const totalEarnings = { wagered: 0, net: 0, worstLoss: 0 };
    const summary: StatsSummary = {
      played: 0,
      won: 0,
      bestWin: 0,
      favouriteGame: null,
      earnings: totalEarnings,
    };
    for (const game of games) {
      const earnings = game.earnings!;
      summary.played += game.played;
      summary.won += game.won;
      summary.bestWin = Math.max(summary.bestWin, game.bestWin);
      totalEarnings.wagered += earnings.wagered;
      totalEarnings.net += earnings.net;
      totalEarnings.worstLoss = Math.max(
        totalEarnings.worstLoss,
        earnings.worstLoss,
      );
      if (game.played > mostPlayed) {
        mostPlayed = game.played;
        favourite = game.game;
      }
    }
    summary.favouriteGame = favourite;

    return { summary, games } satisfies PlayerStats;
  });

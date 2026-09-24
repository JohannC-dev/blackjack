import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { eq } from "drizzle-orm";
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
import { playerGameStats } from "./schema";

/**
 * Everything the profile reports, earnings included. Hiding them is the
 * caller's job: this module does not know who is watching.
 */
export const statsFor = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const totals = yield* db
      .select({
        game: playerGameStats.game,
        played: playerGameStats.played,
        won: playerGameStats.won,
        wageredMinor: playerGameStats.wageredMinor,
        deltaMinor: playerGameStats.deltaMinor,
        maxWinMinor: playerGameStats.maxWinMinor,
        maxLossMinor: playerGameStats.maxLossMinor,
      })
      .from(playerGameStats)
      .where(eq(playerGameStats.userId, userId));
    const games: GameStats[] = [];
    for (const row of totals) {
      // A game dropped from the catalogue keeps its rows but leaves the profile.
      if (!isStatGame(row.game) || row.played === 0) continue;
      games.push({
        game: row.game,
        played: row.played,
        won: row.won,
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

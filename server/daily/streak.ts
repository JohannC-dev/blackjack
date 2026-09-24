import {
  addDays,
  dayKeyAt,
  daysBetween,
  nextResetAt,
  wheelMultiplierFor,
  type DailyStatus,
  type DayKey,
} from "../../src/lib/daily";

export type StreakRow = {
  readonly current: number;
  readonly best: number;
  readonly lastDay: DayKey | null;
  readonly runStartedDay: DayKey | null;
  readonly lastSpinDay: DayKey | null;
};

export const EMPTY_STREAK: StreakRow = {
  current: 0,
  best: 0,
  lastDay: null,
  runStartedDay: null,
  lastSpinDay: null,
};

/** The streak still alive on `today`: 0 once a whole club day was missed. */
export function liveStreak(row: StreakRow, today: DayKey) {
  if (!row.lastDay) return 0;
  return daysBetween(row.lastDay, today) <= 1 ? row.current : 0;
}

/**
 * Counts `today` for the player. The first connection of the day extends a
 * streak kept up yesterday, or starts a new run; later ones change nothing.
 */
export function advanceStreak(row: StreakRow, today: DayKey) {
  if (row.lastDay === today) return { row, counted: false, lost: 0 };
  const continues = row.lastDay !== null && addDays(row.lastDay, 1) === today;
  const current = continues ? row.current + 1 : 1;
  return {
    row: {
      ...row,
      current,
      best: Math.max(row.best, current),
      lastDay: today,
      runStartedDay: continues ? row.runStartedDay : today,
    } satisfies StreakRow,
    counted: true,
    lost: continues ? 0 : row.current,
  };
}

export function statusOf(row: StreakRow, now: number): DailyStatus {
  const day = dayKeyAt(now);
  const streak = liveStreak(row, day);
  return {
    streak,
    best: row.best,
    day,
    nextResetAt: nextResetAt(now),
    spinAvailable: row.lastSpinDay !== day,
    wheelMultiplier: wheelMultiplierFor(streak),
  };
}

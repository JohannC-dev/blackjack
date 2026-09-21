import type { TowerDifficulty } from "./types";

export const TOWER_FLOORS = 10;
/**
 * Share of each wager returned by the floor multipliers. Another 3 % goes to
 * the player's own Lucky pot, so the Tower returns 96 % in the long run.
 */
export const TOWER_RTP = 0.93;
/** Share of each wager added to the player's own Lucky pot. */
export const TOWER_LUCKY_SHARE = 0.03;
export const TOWER_MIN_BET = 5;
export const TOWER_MAX_BET = 500;
export const TOWER_BET_STEP = 5;
/** Rows, counted from 1, that may hide the golden card of a climb. */
export const TOWER_GOLD_FIRST_FLOOR = 3;
export const TOWER_GOLD_LAST_FLOOR = 6;

export const TOWER_DIFFICULTY_ORDER: readonly TowerDifficulty[] = [
  "easy",
  "normal",
  "hard",
  "impossible",
];

export const TOWER_DIFFICULTIES: Record<
  TowerDifficulty,
  { cols: number; label: string }
> = {
  easy: { cols: 5, label: "Facile" },
  normal: { cols: 4, label: "Normal" },
  hard: { cols: 3, label: "Difficile" },
  impossible: { cols: 2, label: "Impossible" },
};

const MULTIPLIERS = Object.fromEntries(
  TOWER_DIFFICULTY_ORDER.map((difficulty) => {
    const cols = TOWER_DIFFICULTIES[difficulty].cols;
    return [
      difficulty,
      Object.freeze(
        Array.from(
          { length: TOWER_FLOORS },
          // The epsilon keeps exact halves such as 10.935 rounding up despite float error.
          (_, index) =>
            Math.round(
              (cols / (cols - 1)) ** (index + 1) * TOWER_RTP * 100 + 1e-9,
            ) / 100,
        ),
      ),
    ];
  }),
) as Record<TowerDifficulty, readonly number[]>;

export function isTowerDifficulty(value: unknown): value is TowerDifficulty {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TOWER_DIFFICULTIES, value)
  );
}

export function towerMultipliers(difficulty: TowerDifficulty) {
  return MULTIPLIERS[difficulty];
}

/** Multiplier earned after clearing `floor` floors; 0 before the first one. */
export function towerMultiplier(difficulty: TowerDifficulty, floor: number) {
  return floor < 1
    ? 0
    : MULTIPLIERS[difficulty][Math.min(floor, TOWER_FLOORS) - 1];
}

const halfCredit = (value: number) => Math.floor(value * 2) / 2;

export function towerPayout(
  bet: number,
  difficulty: TowerDifficulty,
  floor: number,
) {
  return halfCredit(bet * towerMultiplier(difficulty, floor));
}

/** The part of a Lucky pot that can be paid out, in half credits. */
export function towerLuckyPayout(pot: number) {
  return halfCredit(pot);
}

/** Fire intensity from 0 (cold) to 1 (full blaze). */
export function towerHeat(floor: number) {
  return Math.max(0, Math.min(1, floor / TOWER_FLOORS));
}

export function formatMultiplier(value: number) {
  return `×${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

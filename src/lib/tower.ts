import type { TowerDifficulty } from "./types";
import { CASINO_MAX_BET, CASINO_CHIP_DENOMINATIONS } from "./chips";

export const TOWER_FLOORS = 10;
/**
 * Share of each wager added to the player's own Lucky pot, on top of what the
 * floor multipliers return.
 */
export const TOWER_LUCKY_SHARE = 0.03;
export const TOWER_MIN_BET = CASINO_CHIP_DENOMINATIONS[0];
export const TOWER_MAX_BET = CASINO_MAX_BET;
export const TOWER_BET_STEP = CASINO_CHIP_DENOMINATIONS[0];
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

/**
 * The Tower of Chance tables of MONOPOLY Poker, cut to three significant
 * digits like the game shows them. Normal, Difficile and Impossible are its
 * Easy (4 cards), Medium (3) and Hard (2); the returned share slowly drops as
 * the climb goes up. Values read in the game: Impossible floors 1-4,
 * Difficile 1-4, Normal 1-4 and 7-9. The other floors follow the same
 * curves. Facile (5 cards, absent from the game) returns even less, from
 * 88 % down to 84 %.
 */
const MULTIPLIERS: Record<TowerDifficulty, readonly number[]> = {
  easy: [1.1, 1.36, 1.7, 2.11, 2.63, 3.28, 4.08, 5.07, 6.31, 7.86],
  normal: [1.2, 1.6, 2.12, 2.82, 3.74, 4.98, 6.63, 8.82, 11.7, 15.5],
  hard: [1.37, 2.04, 3.05, 4.57, 6.83, 10.2, 15.2, 22.7, 34, 50.9],
  impossible: [1.84, 3.67, 7.32, 14.6, 29.1, 58, 115, 231, 460, 919],
};

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
    maximumFractionDigits: 2,
  }).format(value)}`;
}

import { CASINO_MAX_BET, CASINO_CHIP_DENOMINATIONS } from "./chips";

export const MINES_GRID_SIDE = 5;
export const MINES_GRID_SIZE = MINES_GRID_SIDE * MINES_GRID_SIDE;
export const MINES_MIN_BET = CASINO_CHIP_DENOMINATIONS[0];
export const MINES_MAX_BET = CASINO_MAX_BET;
export const MINES_BET_STEP = CASINO_CHIP_DENOMINATIONS[0];
export const MINES_HOUSE_EDGE = 0.04;

export const MINES_TARGETS = [110, 125, 150, 200, 300, 500, 1000] as const;
export type MinesTarget = (typeof MINES_TARGETS)[number];

/**
 * The player chooses a target return rather than a raw mine count. Higher
 * targets intentionally select a denser grid, keeping the risk legible.
 */
const MINE_COUNT_BY_TARGET: Record<MinesTarget, number> = {
  110: 2,
  125: 4,
  150: 6,
  200: 9,
  300: 12,
  500: 16,
  1000: 20,
};

export const MINES_TARGET_OPTIONS = MINES_TARGETS.map((target) => ({
  target,
  mines: MINE_COUNT_BY_TARGET[target],
}));

export function isMinesTarget(value: number): value is MinesTarget {
  return MINES_TARGETS.includes(value as MinesTarget);
}

export function minesForTarget(target: MinesTarget) {
  return MINE_COUNT_BY_TARGET[target];
}

/**
 * Fair multiplier after `revealedCount` safe picks, with a small house edge.
 * Drawing is without replacement, as in the familiar 5×5 Mines format.
 */
export function minesMultiplier(mineCount: number, revealedCount: number) {
  if (revealedCount <= 0) return 1;
  if (
    mineCount < 1 ||
    mineCount >= MINES_GRID_SIZE ||
    revealedCount > MINES_GRID_SIZE - mineCount
  )
    return 1;

  let survivalProbability = 1;
  for (let step = 0; step < revealedCount; step++) {
    survivalProbability *=
      (MINES_GRID_SIZE - mineCount - step) / (MINES_GRID_SIZE - step);
  }
  return Math.max(
    1,
    Math.floor(((1 - MINES_HOUSE_EDGE) / survivalProbability) * 100) / 100,
  );
}

export function minesPayout(bet: number, multiplier: number) {
  return Math.max(0, Math.round(bet * multiplier));
}

import type { ChickenDifficulty } from "./types";
import { CASINO_MAX_BET, CASINO_CHIP_DENOMINATIONS } from "./chips";

/** Stake Originals Chicken payout table, published in September 2025.
 * https://cdn.sanity.io/images/tdrhge4k/stake-com-production/097749a062a724c0e601f3a51c1210d495e61bac-1500x1872.png
 */
export const CHICKEN_MULTIPLIERS: Record<ChickenDifficulty, readonly number[]> =
  {
    easy: [
      1.03, 1.09, 1.15, 1.23, 1.31, 1.4, 1.51, 1.63, 1.78, 1.96, 2.18, 2.45,
      2.8, 3.27, 3.92, 4.9, 6.53, 9.8, 19.6,
    ],
    medium: [
      1.15, 1.37, 1.64, 2, 2.46, 3.07, 3.91, 5.08, 6.77, 9.31, 13.3, 19.95,
      31.92, 55.86, 111.72, 279.3, 1117.2,
    ],
    hard: [
      1.31, 1.77, 2.46, 3.48, 5.06, 7.59, 11.81, 19.18, 32.89, 60.29, 120.59,
      271.32, 723.52, 2532.32, 15193.92,
    ],
    expert: [
      1.96, 4.14, 9.31, 22.61, 60.29, 180.88, 633.08, 2743.35, 16460.08,
      181060.88,
    ],
  };

export const CHICKEN_DIFFICULTIES: Record<
  ChickenDifficulty,
  { label: string; hazards: number; color: string }
> = {
  easy: { label: "Facile", hazards: 1, color: "#89dac4" },
  medium: { label: "Moyen", hazards: 3, color: "#b7a0ff" },
  hard: { label: "Difficile", hazards: 5, color: "#f3b76a" },
  expert: { label: "Expert", hazards: 10, color: "#f27b89" },
};
export const CHICKEN_DIFFICULTY_ORDER = [
  "easy",
  "medium",
  "hard",
  "expert",
] as const;
export const CHICKEN_MIN_BET = CASINO_CHIP_DENOMINATIONS[0];
/** Chicken shares the casino wager ceiling used by Tower and Mines. */
export const CHICKEN_MAX_BET = CASINO_MAX_BET;
export const CHICKEN_BET_STEP = CASINO_CHIP_DENOMINATIONS[0];
export const CHICKEN_ROOM_SIZE = 10;

export function isChickenDifficulty(
  value: unknown,
): value is ChickenDifficulty {
  return (
    typeof value === "string" && Object.hasOwn(CHICKEN_DIFFICULTIES, value)
  );
}

export function chickenMultiplier(difficulty: ChickenDifficulty, step: number) {
  return step < 1 ? 0 : (CHICKEN_MULTIPLIERS[difficulty][step - 1] ?? 0);
}

export function chickenPayout(
  bet: number,
  difficulty: ChickenDifficulty,
  step: number,
) {
  return Math.floor(bet * chickenMultiplier(difficulty, step) * 2) / 2;
}

export function chickenBet(value: number) {
  return (
    Number.isSafeInteger(value) &&
    value >= CHICKEN_MIN_BET &&
    value <= CHICKEN_MAX_BET &&
    value % CHICKEN_BET_STEP === 0
  );
}

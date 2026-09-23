import {
  CASINO_MAX_BET,
  CASINO_CHIP_DENOMINATIONS,
  chipCountTotal,
} from "./chips";
import type { ChipCount } from "./types";

/**
 * European roulette, ported from Malori's party roulette: same bet kinds,
 * same table layout and payouts, settled in credits instead of drinks.
 */
export type RouletteBetKind =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "line"
  | "dozen"
  | "column"
  | "parity"
  | "color"
  | "half";

export type RouletteBet = {
  kind: RouletteBetKind;
  selection: string;
  amount: number;
  chips?: readonly ChipCount[];
};

export const ROULETTE_MIN_CHIP = CASINO_CHIP_DENOMINATIONS[0];
/** Ceiling of one player's stake on a single spot, not on the whole layout. */
export const ROULETTE_MAX_PER_SPOT = CASINO_MAX_BET;
export const ROULETTE_MAX_BETS = 60;
export const ROULETTE_HISTORY_SIZE = 14;

export const EUROPEAN_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function rouletteNumberColor(number: number) {
  if (number === 0) return "green" as const;
  return RED_NUMBERS.has(number) ? ("red" as const) : ("black" as const);
}

/** Net payout "pour 1": a winning bet also gets its stake back. */
export const ROULETTE_PAYOUTS: Record<RouletteBetKind, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  line: 5,
  dozen: 2,
  column: 2,
  parity: 1,
  color: 1,
  half: 1,
};

export function rouletteBetId(bet: Pick<RouletteBet, "kind" | "selection">) {
  return `${bet.kind}:${bet.selection}`;
}

function parseNumbers(selection: string) {
  return selection.split("-").map(Number);
}

/**
 * Numbers of a selection, only in their canonical spelling: "1", never "01"
 * or "1.0", so one spot can never be played under two different ids.
 */
function canonicalNumbers(selection: string, count: number) {
  const numbers = parseNumbers(selection);
  if (
    numbers.length !== count ||
    numbers.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 36,
    ) ||
    numbers.map(String).join("-") !== selection
  )
    return null;
  return numbers;
}

function isStraight(selection: string) {
  return canonicalNumbers(selection, 1) !== null;
}

function isSplit(selection: string) {
  const numbers = canonicalNumbers(selection, 2);
  if (!numbers) return false;
  const [first, second] = numbers;
  // European zero splits: 0/1, 0/2 and 0/3.
  if (first === 0) return second >= 1 && second <= 3;
  if (first >= second) return false;
  const vertical =
    second - first === 1 && Math.ceil(first / 3) === Math.ceil(second / 3);
  const horizontal = second - first === 3;
  return vertical || horizontal;
}

/** Transversale pleine: the three numbers of a printed column, 1-2-3 up. */
function isStreet(selection: string) {
  const numbers = canonicalNumbers(selection, 3);
  if (!numbers) return false;
  const [first, second, third] = numbers;
  return (
    first >= 1 && first % 3 === 1 && second === first + 1 && third === first + 2
  );
}

/** Sixain: the six numbers of two neighbouring columns, 1 to 6 up. */
function isLine(selection: string) {
  const numbers = canonicalNumbers(selection, 6);
  if (!numbers) return false;
  const [first] = numbers;
  return (
    first >= 1 &&
    first <= 31 &&
    first % 3 === 1 &&
    numbers.every((number, index) => number === first + index)
  );
}

function isCorner(selection: string) {
  const numbers = canonicalNumbers(selection, 4);
  if (!numbers) return false;
  const [first, second, third, fourth] = numbers;
  return (
    first >= 1 &&
    first <= 32 &&
    first % 3 !== 0 &&
    second === first + 1 &&
    third === first + 3 &&
    fourth === first + 4
  );
}

export function isValidRouletteSelection(
  kind: RouletteBetKind,
  selection: string,
) {
  switch (kind) {
    case "straight":
      return isStraight(selection);
    case "split":
      return isSplit(selection);
    case "street":
      return isStreet(selection);
    case "corner":
      return isCorner(selection);
    case "line":
      return isLine(selection);
    case "dozen":
    case "column":
      return selection === "1" || selection === "2" || selection === "3";
    case "parity":
      return selection === "even" || selection === "odd";
    case "color":
      return selection === "red" || selection === "black";
    case "half":
      return selection === "low" || selection === "high";
    default:
      return false;
  }
}

export function isValidRouletteBet(bet: RouletteBet) {
  return (
    !!bet &&
    typeof bet.kind === "string" &&
    typeof bet.selection === "string" &&
    Number.isSafeInteger(bet.amount) &&
    bet.amount >= ROULETTE_MIN_CHIP &&
    bet.amount % ROULETTE_MIN_CHIP === 0 &&
    (bet.chips === undefined ||
      (Array.isArray(bet.chips) &&
        bet.chips.length <= CASINO_CHIP_DENOMINATIONS.length &&
        bet.chips.every(
          (chip) =>
            chip &&
            CASINO_CHIP_DENOMINATIONS.some(
              (amount) => amount === chip.denomination,
            ) &&
            Number.isSafeInteger(chip.count) &&
            chip.count > 0,
        ) &&
        new Set(bet.chips.map((chip) => chip.denomination)).size ===
          bet.chips.length &&
        chipCountTotal(bet.chips) === bet.amount)) &&
    isValidRouletteSelection(bet.kind, bet.selection)
  );
}

export function rouletteBetWins(
  bet: Pick<RouletteBet, "kind" | "selection">,
  result: number,
) {
  switch (bet.kind) {
    case "straight":
    case "split":
    case "street":
    case "corner":
    case "line":
      return parseNumbers(bet.selection).includes(result);
    case "dozen":
      return result !== 0 && Math.ceil(result / 12) === Number(bet.selection);
    case "column":
      return result !== 0 && ((result - 1) % 3) + 1 === Number(bet.selection);
    case "parity":
      return (
        result !== 0 && (result % 2 === 0 ? "even" : "odd") === bet.selection
      );
    case "color":
      return result !== 0 && rouletteNumberColor(result) === bet.selection;
    case "half":
      return result !== 0 && (result <= 18 ? "low" : "high") === bet.selection;
  }
}

/** Total credited back for a spin: stake plus winnings on each winning bet. */
export function rouletteReturn(bets: readonly RouletteBet[], result: number) {
  return bets.reduce(
    (sum, bet) =>
      rouletteBetWins(bet, result)
        ? sum + bet.amount * (ROULETTE_PAYOUTS[bet.kind] + 1)
        : sum,
    0,
  );
}

export function rouletteTotal(bets: readonly RouletteBet[]) {
  return bets.reduce((sum, bet) => sum + bet.amount, 0);
}

export function rouletteBetLabel(bet: Pick<RouletteBet, "kind" | "selection">) {
  switch (bet.kind) {
    case "straight":
      return `Plein ${bet.selection}`;
    case "split":
      return `Cheval ${bet.selection.replace("-", "/")}`;
    case "street":
      return `Transversale pleine ${bet.selection.split("-").join("/")}`;
    case "corner":
      return `Carré ${bet.selection.split("-").join("/")}`;
    case "line": {
      const numbers = parseNumbers(bet.selection);
      return `Sixain ${numbers[0]} à ${numbers[numbers.length - 1]}`;
    }
    case "dozen":
      return `${bet.selection}${bet.selection === "1" ? "re" : "e"} douzaine`;
    case "column":
      return `${bet.selection}${bet.selection === "1" ? "re" : "e"} colonne`;
    case "parity":
      return bet.selection === "even" ? "Pair" : "Impair";
    case "color":
      return bet.selection === "red" ? "Rouge" : "Noir";
    case "half":
      return bet.selection === "low" ? "Manque (1-18)" : "Passe (19-36)";
  }
}

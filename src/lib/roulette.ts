/**
 * European roulette, ported from Malori's party roulette: same bet kinds,
 * same table layout and payouts, settled in credits instead of drinks.
 */
export type RouletteBetKind =
  | "straight"
  | "split"
  | "corner"
  | "dozen"
  | "column"
  | "parity"
  | "color"
  | "half";

export type RouletteBet = {
  kind: RouletteBetKind;
  selection: string;
  amount: number;
};

export const ROULETTE_MIN_CHIP = 5;
export const ROULETTE_MAX_TOTAL = 500;
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
  corner: 8,
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

function isStraight(selection: string) {
  const value = Number(selection);
  return (
    /^\d{1,2}$/.test(selection) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 36
  );
}

function isSplit(selection: string) {
  if (!/^\d{1,2}-\d{1,2}$/.test(selection)) return false;
  const [first, second] = parseNumbers(selection);
  if (first < 1 || second > 36 || first >= second) return false;
  const vertical =
    second - first === 1 && Math.ceil(first / 3) === Math.ceil(second / 3);
  const horizontal = second - first === 3;
  return vertical || horizontal;
}

function isCorner(selection: string) {
  if (!/^\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(selection)) return false;
  const [first, second, third, fourth] = parseNumbers(selection);
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
    case "corner":
      return isCorner(selection);
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
    case "corner":
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
export function rouletteReturn(bets: RouletteBet[], result: number) {
  return bets.reduce(
    (sum, bet) =>
      rouletteBetWins(bet, result)
        ? sum + bet.amount * (ROULETTE_PAYOUTS[bet.kind] + 1)
        : sum,
    0,
  );
}

export function rouletteTotal(bets: RouletteBet[]) {
  return bets.reduce((sum, bet) => sum + bet.amount, 0);
}

export function rouletteBetLabel(bet: Pick<RouletteBet, "kind" | "selection">) {
  switch (bet.kind) {
    case "straight":
      return `Plein ${bet.selection}`;
    case "split":
      return `Cheval ${bet.selection.replace("-", "/")}`;
    case "corner":
      return `Carré ${bet.selection.split("-").join("/")}`;
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

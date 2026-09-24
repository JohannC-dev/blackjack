import { CASINO_MAX_BET, CASINO_CHIP_DENOMINATIONS } from "./chips";

export const PLINKO_MIN_BET = CASINO_CHIP_DENOMINATIONS[0];
export const PLINKO_MAX_BET = CASINO_MAX_BET;
export const PLINKO_BET_STEP = CASINO_CHIP_DENOMINATIONS[0];

/** Ceiling the published tables must stay under once rounded. */
export const PLINKO_MAX_RETURN = 0.99;

/** Share of the stakes returned to the players over an infinite number of drops. */
export const PLINKO_RETURN = 0.985;

export const PLINKO_RISKS = ["low", "medium", "high"] as const;
export type PlinkoRisk = (typeof PLINKO_RISKS)[number];

export const PLINKO_ROW_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
export type PlinkoRows = (typeof PLINKO_ROW_OPTIONS)[number];
export const PLINKO_MIN_ROWS = PLINKO_ROW_OPTIONS[0];
export const PLINKO_MAX_ROWS =
  PLINKO_ROW_OPTIONS[PLINKO_ROW_OPTIONS.length - 1];

/** Balls a single drop command may launch, so the auto mode stays one round trip. */
export const PLINKO_MAX_BALLS = 10;
/** Drops kept in the published state, newest last. */
export const PLINKO_HISTORY_SIZE = 12;

export const PLINKO_RISK_LABELS: Record<PlinkoRisk, string> = {
  low: "Faible",
  medium: "Moyen",
  high: "Élevé",
};

/**
 * A ball bounces left or right at every row, so the landing slot follows a
 * binomial law: the centre is common, the edges are rare. Paying `1 / p` would
 * make every slot worth the same; raising that to a power below one flattens
 * the edges back down and sets how wild the game feels.
 */
const RISK_CURVE: Record<PlinkoRisk, number> = {
  low: 0.38,
  medium: 0.63,
  high: 0.845,
};

export function isPlinkoRisk(value: unknown): value is PlinkoRisk {
  return PLINKO_RISKS.includes(value as PlinkoRisk);
}

export function isPlinkoRows(value: unknown): value is PlinkoRows {
  return PLINKO_ROW_OPTIONS.includes(value as PlinkoRows);
}

/** Probability of each slot, from the far left to the far right. */
export function plinkoSlotProbabilities(rows: number): number[] {
  const total = Math.pow(2, rows);
  const probabilities: number[] = [];
  let paths = 1;
  for (let slot = 0; slot <= rows; slot++) {
    probabilities.push(paths / total);
    paths = (paths * (rows - slot)) / (slot + 1);
  }
  return probabilities;
}

const multiplierCache = new Map<string, readonly number[]>();

/**
 * Rounding of a published multiplier. A slot badge is only as wide as a peg
 * gap, so the table is designed on round numbers: one decimal below ten, an
 * integer above.
 */
function roundMultiplier(value: number) {
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

/** Smallest increase a published multiplier can take. */
function multiplierStep(value: number) {
  return value >= 10 ? 1 : 0.1;
}

function tableReturn(
  multipliers: readonly number[],
  probabilities: readonly number[],
) {
  return multipliers.reduce(
    (total, multiplier, slot) => total + multiplier * probabilities[slot],
    0,
  );
}

/**
 * Multipliers of every slot for a risk and a row count.
 *
 * Rounding to numbers a player can read moves the return by more than a house
 * edge — a tenth on the centre slot is several percent — so the shape is first
 * scaled down until it fits under {@link PLINKO_MAX_RETURN}, then the slots are
 * raised one step at a time, symmetrically, for as long as the ceiling holds.
 * Every table therefore lands just under it, and what the player reads is
 * exactly what the server pays.
 */
export function plinkoMultipliers(
  risk: PlinkoRisk,
  rows: number,
): readonly number[] {
  const key = `${risk}:${rows}`;
  const cached = multiplierCache.get(key);
  if (cached) return cached;

  const probabilities = plinkoSlotProbabilities(rows);
  const curve = RISK_CURVE[risk];
  const shape = probabilities.map((probability) =>
    Math.pow(1 / probability, curve),
  );
  const expected = tableReturn(shape, probabilities);
  const build = (factor: number) =>
    shape.map((value) =>
      Math.max(0.1, roundMultiplier((value * factor) / expected)),
    );

  let factor = PLINKO_MAX_RETURN;
  if (tableReturn(build(factor), probabilities) > PLINKO_MAX_RETURN) {
    let low = 0;
    let high = factor;
    for (let pass = 0; pass < 50; pass++) {
      const middle = (low + high) / 2;
      if (tableReturn(build(middle), probabilities) > PLINKO_MAX_RETURN)
        high = middle;
      else low = middle;
    }
    factor = low;
  }

  const multipliers = build(factor);
  // Symmetric pairs are raised together, so both edges stay worth the same.
  for (let pass = 0; pass < 200; pass++) {
    let bestSlot = -1;
    let bestGain = 0;
    const current = tableReturn(multipliers, probabilities);
    for (let slot = 0; slot <= rows / 2; slot++) {
      const mirror = rows - slot;
      const step = multiplierStep(multipliers[slot]);
      const weight =
        probabilities[slot] + (mirror === slot ? 0 : probabilities[mirror]);
      const gain = step * weight;
      if (gain <= bestGain || current + gain > PLINKO_MAX_RETURN) continue;
      // The table only ever grows towards the edges: never lift a slot above
      // the one outside it.
      if (
        slot > 0 &&
        roundMultiplier(multipliers[slot] + step) > multipliers[slot - 1]
      )
        continue;
      bestGain = gain;
      bestSlot = slot;
    }
    if (bestSlot < 0) break;
    const step = multiplierStep(multipliers[bestSlot]);
    const raised = roundMultiplier(multipliers[bestSlot] + step);
    multipliers[bestSlot] = raised;
    multipliers[rows - bestSlot] = raised;
  }

  multiplierCache.set(key, multipliers);
  return multipliers;
}

/** Actual return of a published table. */
export function plinkoReturn(risk: PlinkoRisk, rows: number) {
  return tableReturn(
    plinkoMultipliers(risk, rows),
    plinkoSlotProbabilities(rows),
  );
}

export function plinkoPayout(bet: number, multiplier: number) {
  return Math.max(0, Math.round(bet * multiplier));
}

/** Slot reached by a path of bounces, 0 to the left and 1 to the right. */
export function plinkoSlot(path: readonly number[]) {
  return path.reduce((slot, step) => slot + step, 0);
}

/** Tone of a slot badge, from the cold centre to the hot edges. */
export function plinkoSlotHeat(slot: number, rows: number) {
  const distance = Math.abs(slot - rows / 2) / (rows / 2);
  return Math.min(1, Math.max(0, distance));
}

/** Exact value of the slot, trailing zeros dropped: 241x, 11.8x, 0.66x. */
export function plinkoMultiplierLabel(multiplier: number) {
  return `${Number(multiplier.toFixed(2))}x`;
}

/**
 * Same value on a slot badge, which is only as wide as one peg gap: past a
 * thousand the `x` is dropped rather than shrinking the whole row.
 */
export function plinkoSlotLabel(multiplier: number) {
  return multiplier >= 1000
    ? String(Math.round(multiplier))
    : plinkoMultiplierLabel(multiplier);
}

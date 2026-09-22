import type { BetChips, ChipCount } from "./types";

export const INITIAL_CREDIT_BALANCE = 500_000;

export const CASINO_CHIP_DENOMINATIONS = [
  5_000, 20_000, 100_000, 500_000, 2_000_000, 10_000_000, 50_000_000,
  200_000_000, 1_000_000_000,
] as const;

export const CASINO_MAX_BET = 20_000_000_000;
export const BLACKJACK_MIN_BET = 15_000;
export const BLACKJACK_MAX_BET = 20_000_000_000;
export const BLACKJACK_MAX_SIDE_BET = 160_000_000;

export const BLACKJACK_CHIP_PRESETS = [
  [15_000, 30_000, 60_000, 150_000],
  [200_000, 400_000, 800_000, 1_600_000],
  [2_000_000, 4_000_000, 8_000_000, 16_000_000],
  [20_000_000, 40_000_000, 80_000_000, 160_000_000],
] as const;

export const BLACKJACK_CHIP_DENOMINATIONS =
  BLACKJACK_CHIP_PRESETS.flat() as ReadonlyArray<number>;

export type CasinoChipDenomination = (typeof CASINO_CHIP_DENOMINATIONS)[number];

export type CasinoChipStackStage = {
  index: 1 | 2 | 3 | 4;
  columns: ReadonlyArray<{
    denomination: number;
    layers: number;
  }>;
};

export function emptyBetChips(): BetChips {
  return { main: [], three: [], pairs: [] };
}

export function copyBetChips(chips: BetChips): BetChips {
  return {
    main: chips.main.map((chip) => ({ ...chip })),
    three: chips.three.map((chip) => ({ ...chip })),
    pairs: chips.pairs.map((chip) => ({ ...chip })),
  };
}

export function addBetChip(
  chips: BetChips,
  type: keyof BetChips,
  denomination: number,
): BetChips {
  const next = copyBetChips(chips);
  const existing = next[type].find(
    (chip) => chip.denomination === denomination,
  );
  if (existing) existing.count++;
  else next[type].push({ denomination, count: 1 });
  return next;
}

export function mergeChipCounts(
  left: readonly ChipCount[],
  right: readonly ChipCount[],
): ChipCount[] {
  const merged = left.map((chip) => ({ ...chip }));
  for (const chip of right) {
    const existing = merged.find(
      (entry) => entry.denomination === chip.denomination,
    );
    if (existing) existing.count += chip.count;
    else merged.push({ ...chip });
  }
  return merged;
}

export function chipCountTotal(chips: readonly ChipCount[]) {
  return chips.reduce(
    (total, chip) => total + chip.denomination * chip.count,
    0,
  );
}

export function chipStackForComposition(
  chips: readonly ChipCount[] | undefined,
  amount: number,
  maximum: number,
): CasinoChipStackStage {
  const stage = casinoChipStackForAmount(amount, maximum);
  if (!chips?.length) {
    const denominations = CASINO_CHIP_DENOMINATIONS.filter(
      (denomination) => denomination <= amount,
    ).reverse();
    return {
      ...stage,
      columns: stage.columns.map((column, index) => ({
        ...column,
        denomination:
          denominations[index] ??
          denominations[denominations.length - 1] ??
          chipColorDenomination(amount),
      })),
    };
  }
  const columns = chips
    .filter((chip) => chip.count > 0)
    .slice(-3)
    .map((chip) => ({
      denomination: chip.denomination,
      layers: Math.min(chip.count + 1, 5),
    }));
  if (!columns.length)
    return chipStackForComposition(undefined, amount, maximum);

  const count = chips.reduce(
    (total, chip) => total + Math.max(0, chip.count),
    0,
  );
  let index: CasinoChipStackStage["index"] = 4;
  if (count <= 1) index = 1;
  else if (count <= 3) index = 2;
  else if (count <= 6) index = 3;
  return {
    index,
    columns,
  };
}

const CHIP_STACK_STAGES: ReadonlyArray<CasinoChipStackStage> = [
  { index: 1, columns: [{ denomination: 5_000, layers: 2 }] },
  { index: 2, columns: [{ denomination: 20_000, layers: 4 }] },
  {
    index: 3,
    columns: [
      { denomination: 100_000, layers: 4 },
      { denomination: 20_000, layers: 3 },
    ],
  },
  {
    index: 4,
    columns: [
      { denomination: 500_000, layers: 5 },
      { denomination: 100_000, layers: 4 },
      { denomination: 20_000, layers: 3 },
    ],
  },
];

export function casinoChipStackForAmount(
  amount: number,
  maximum: number,
): CasinoChipStackStage {
  const ratio = Math.max(0, amount) / Math.max(1, maximum);
  if (ratio <= 0.1) return CHIP_STACK_STAGES[0];
  if (ratio <= 0.3) return CHIP_STACK_STAGES[1];
  if (ratio <= 0.65) return CHIP_STACK_STAGES[2];
  return CHIP_STACK_STAGES[3];
}

const CHIP_PALETTES = [
  ["#f5d7d7", "#a53c47", "#d27d83", "#60212b"],
  ["#d5e4fa", "#3266a2", "#83a8d4", "#1b3a67"],
  ["#d9edda", "#3b8650", "#8fc89a", "#215333"],
  ["#f8e5c4", "#b0782a", "#dbb873", "#684316"],
  ["#e6dcf5", "#7650a4", "#ad92d0", "#422867"],
  ["#f4dbe9", "#a74579", "#d98fb3", "#612648"],
  ["#d1ecec", "#287f86", "#7fc2c5", "#174f55"],
  ["#d4e4ff", "#215fc4", "#78a4ee", "#172c67"],
  ["#d6c6a6", "#17191d", "#6b5b43", "#07080a"],
] as const;

/** Blackjack values between casino denominations share the lower chip's colour. */
export function chipColorDenomination(amount: number) {
  for (let index = CASINO_CHIP_DENOMINATIONS.length - 1; index >= 0; index--)
    if (amount >= CASINO_CHIP_DENOMINATIONS[index])
      return CASINO_CHIP_DENOMINATIONS[index];
  return CASINO_CHIP_DENOMINATIONS[0];
}

export function chipColors(amount: number) {
  const index = CASINO_CHIP_DENOMINATIONS.indexOf(
    chipColorDenomination(amount),
  );
  const [edge, base, border, shadow] = CHIP_PALETTES[index];
  return {
    "--chip-edge": edge,
    "--chip-base": base,
    "--chip-border": border,
    "--chip-shadow": shadow,
    "--chip-text": "#fffaf0",
  };
}

export function chipLabel(amount: number) {
  const units = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ] as const;
  for (const [unit, suffix] of units) {
    if (amount < unit) continue;
    const value = amount / unit;
    return `${new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
    }).format(value)}${suffix}`;
  }
  return String(amount);
}

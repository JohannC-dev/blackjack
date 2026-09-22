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
    denomination: CasinoChipDenomination;
    layers: number;
  }>;
};

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

const ALL_CHIP_DENOMINATIONS: readonly number[] = [
  ...CASINO_CHIP_DENOMINATIONS,
  ...BLACKJACK_CHIP_DENOMINATIONS,
].filter((amount, index, values) => values.indexOf(amount) === index);

/** Gives every denomination its own palette, including blackjack table chips. */
export function chipColors(amount: number) {
  const knownIndex = ALL_CHIP_DENOMINATIONS.indexOf(amount);
  const index = knownIndex >= 0 ? knownIndex : Math.abs(Math.round(amount));
  const hue = Math.round((268 + index * 137.508) % 360);
  const lightness = 39 + (index % 3) * 5;
  return {
    "--chip-edge": `hsl(${hue} 72% 82%)`,
    "--chip-base": `hsl(${hue} 48% ${lightness}%)`,
    "--chip-border": `hsl(${hue} 58% 68%)`,
    "--chip-shadow": `hsl(${hue} 42% 22%)`,
    "--chip-text": lightness > 45 ? "#17121f" : "#fffaf0",
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

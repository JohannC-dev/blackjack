export const CASINO_CHIP_DENOMINATIONS = [5, 25, 50, 100] as const;

export type CasinoChipDenomination = (typeof CASINO_CHIP_DENOMINATIONS)[number];

export type CasinoChipStackStage = {
  index: 1 | 2 | 3 | 4;
  columns: ReadonlyArray<{
    denomination: CasinoChipDenomination;
    layers: number;
  }>;
};

const CHIP_STACK_STAGES: ReadonlyArray<CasinoChipStackStage> = [
  { index: 1, columns: [{ denomination: 5, layers: 2 }] },
  { index: 2, columns: [{ denomination: 25, layers: 4 }] },
  {
    index: 3,
    columns: [
      { denomination: 50, layers: 4 },
      { denomination: 25, layers: 3 },
    ],
  },
  {
    index: 4,
    columns: [
      { denomination: 100, layers: 5 },
      { denomination: 50, layers: 4 },
      { denomination: 25, layers: 3 },
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

export const CASINO_CHIP_DENOMINATIONS = [5, 25, 50, 100] as const;

export type CasinoChipDenomination = (typeof CASINO_CHIP_DENOMINATIONS)[number];

export type CasinoChipStackStage = {
  index: 1 | 2 | 3 | 4;
  columns: ReadonlyArray<{
    denomination: CasinoChipDenomination;
    layers: number;
  }>;
};

// The picker and every pile use the same colour ranges. A value between two
// denominations keeps the colour of the lower denomination.
export function casinoChipDenominationForAmount(
  amount: number,
): CasinoChipDenomination {
  for (let index = CASINO_CHIP_DENOMINATIONS.length - 1; index >= 0; index--) {
    const denomination = CASINO_CHIP_DENOMINATIONS[index];
    if (amount >= denomination) return denomination;
  }
  return CASINO_CHIP_DENOMINATIONS[0];
}

const CHIP_STACK_LAYERS = [[2], [4], [4, 3], [5, 4, 3]] as const;

export function casinoChipStackForAmount(
  amount: number,
  maximum: number,
): CasinoChipStackStage {
  const ratio = Math.max(0, amount) / Math.max(1, maximum);
  const index: CasinoChipStackStage["index"] =
    ratio <= 0.1 ? 1 : ratio <= 0.3 ? 2 : ratio <= 0.65 ? 3 : 4;
  const denomination = casinoChipDenominationForAmount(amount);
  return {
    index,
    columns: CHIP_STACK_LAYERS[index - 1].map((layers) => ({
      denomination,
      layers,
    })),
  };
}

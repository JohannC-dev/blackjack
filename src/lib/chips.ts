export const CASINO_CHIP_DENOMINATIONS = [5, 25, 50, 100] as const;

export type CasinoChipDenomination = (typeof CASINO_CHIP_DENOMINATIONS)[number];

export function chipDenominationForAmount(
  amount: number,
): CasinoChipDenomination {
  if (amount >= 100) return 100;
  if (amount >= 50) return 50;
  if (amount >= 25) return 25;
  return 5;
}

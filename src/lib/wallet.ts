export const REFILL_THRESHOLD = 5_000;
export const REFILL_BALANCE = 10_000;

export function refillBalance(balance: number): number {
  if (balance >= REFILL_THRESHOLD)
    throw new Error("La recave est disponible sous 5 000 crédits.");
  return REFILL_BALANCE;
}

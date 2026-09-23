export const MINOR_PER_CREDIT = 100;

export function toMinor(credits: number) {
  const minor = Math.round(credits * MINOR_PER_CREDIT);
  if (!Number.isSafeInteger(minor))
    throw new Error("Montant de portefeuille invalide.");
  return minor;
}

export function fromMinor(minor: number) {
  return minor / MINOR_PER_CREDIT;
}

import { memo } from "react";
import { casinoChipDenominationForAmount } from "@/lib/chips";

export const Chip = memo(function Chip({
  amount,
  selected = false,
  onClick,
  disabled = false,
  label,
}: {
  amount: number;
  selected?: boolean;
  onClick?: (amount: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`chip chip-${casinoChipDenominationForAmount(amount)} ${selected ? "selected" : ""}`}
      onClick={() => onClick?.(amount)}
      disabled={disabled}
      aria-label={label ?? `Sélectionner le jeton de ${amount} crédits`}
      aria-pressed={selected}
    >
      <span>{amount}</span>
    </button>
  );
});

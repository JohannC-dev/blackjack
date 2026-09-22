import { memo, type CSSProperties } from "react";
import { chipColors, chipLabel } from "@/lib/chips";
import { credits } from "@/lib/rules";

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
      className={`chip chip-${amount} ${selected ? "selected" : ""}`}
      style={chipColors(amount) as CSSProperties}
      onClick={() => onClick?.(amount)}
      disabled={disabled}
      aria-label={
        label ?? `Sélectionner le jeton de ${credits(amount)} crédits`
      }
      aria-pressed={selected}
    >
      <span>{chipLabel(amount)}</span>
    </button>
  );
});

import { memo, type CSSProperties } from "react";
import { chipColors, chipLabel } from "@/lib/chips";
import { credits } from "@/lib/rules";

export const Chip = memo(function Chip({
  amount,
  selected = false,
  onClick,
  disabled = false,
  label,
  displayOnly = false,
  className = "",
}: {
  amount: number;
  selected?: boolean;
  onClick?: (amount: number) => void;
  disabled?: boolean;
  label?: string;
  displayOnly?: boolean;
  className?: string;
}) {
  const classes = `chip chip-${amount} ${selected ? "selected" : ""} ${className}`;
  const style = chipColors(amount) as CSSProperties;
  const contents = <span>{chipLabel(amount)}</span>;

  if (displayOnly) {
    return (
      <span
        className={`${classes} display-only`}
        style={style}
        aria-hidden="true"
      >
        {contents}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      onClick={() => onClick?.(amount)}
      disabled={disabled}
      aria-label={
        label ?? `Sélectionner le jeton de ${credits(amount)} crédits`
      }
      aria-pressed={selected}
    >
      {contents}
    </button>
  );
});

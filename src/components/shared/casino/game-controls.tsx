"use client";

import { LoaderCircle, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { CASINO_CHIP_DENOMINATIONS } from "@/lib/chips";
import { Chip } from "./chip";

export function GameControlsBar({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <footer className="game-controls-bar" aria-label={ariaLabel}>
      {children}
    </footer>
  );
}

export function GameControlGroup({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`game-control-group ${className}`.trim()}>
      <span className="game-control-label">{label}</span>
      {children}
    </div>
  );
}

export function GameOption({
  children,
  selected,
  disabled,
  tone,
  compact = false,
  onClick,
}: {
  children: ReactNode;
  selected: boolean;
  disabled?: boolean;
  tone?: string;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`game-option ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""}`.trim()}
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function BetChipPicker({
  bet,
  maxBet,
  betSteps,
  disabled,
  onAdd,
  onUndo,
  onClear,
}: {
  bet: number;
  maxBet: number;
  betSteps: number[];
  disabled: boolean;
  onAdd: (amount: number) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <div className="chip-picker">
      {CASINO_CHIP_DENOMINATIONS.map((amount) => (
        <Chip
          key={amount}
          amount={amount}
          selected={betSteps.at(-1) === amount && !disabled}
          disabled={disabled || bet + amount > maxBet}
          onClick={onAdd}
          label={`Ajouter ${amount} crédits à la mise`}
        />
      ))}
      <span className="rack-divider" />
      <button
        type="button"
        className="icon-button"
        disabled={disabled || !betSteps.length}
        onClick={onUndo}
        title="Annuler le dernier jeton"
        aria-label="Annuler le dernier jeton"
      >
        <RotateCcw size={17} />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={disabled || !bet}
        onClick={onClear}
        title="Retirer la mise"
        aria-label="Retirer la mise"
      >
        <X size={17} />
      </button>
    </div>
  );
}

export function GameActionButton({
  variant,
  busy,
  disabled,
  icon,
  label,
  subline,
  onClick,
}: {
  variant: "start" | "cashout" | "stop";
  busy: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: ReactNode;
  subline?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`game-action game-action-${variant}`}
      disabled={disabled}
      aria-busy={busy}
      onClick={onClick}
    >
      {busy ? <LoaderCircle size={18} className="spinner" /> : icon}
      <span>
        <b>{label}</b>
        {subline && <small>{subline}</small>}
      </span>
    </button>
  );
}

"use client";

import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CASINO_CHIP_DENOMINATIONS } from "@/lib/chips";
import { Chip } from "./chip";

export function chunkChipPages(
  denominations: readonly number[],
  pageSize = 4,
): ReadonlyArray<ReadonlyArray<number>> {
  const pages: number[][] = [];
  for (let index = 0; index < denominations.length; index += pageSize) {
    pages.push(denominations.slice(index, index + pageSize));
  }
  return pages;
}

export function chipPageForBalance(
  pages: ReadonlyArray<ReadonlyArray<number>>,
  balance: number,
) {
  let selectedPage = 0;
  let bestAffordable = -1;
  pages.forEach((page, pageIndex) => {
    page.forEach((amount) => {
      if (amount <= balance && amount > bestAffordable) {
        bestAffordable = amount;
        selectedPage = pageIndex;
      }
    });
  });
  return selectedPage;
}

export function affordableChipInPage(
  page: ReadonlyArray<number>,
  balance: number,
) {
  return page.filter((amount) => amount <= balance).at(-1) ?? page[0];
}

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
  balance,
  betSteps,
  disabled,
  onAdd,
  onUndo,
  onClear,
}: {
  bet: number;
  maxBet: number;
  balance: number;
  betSteps: number[];
  disabled: boolean;
  onAdd: (amount: number) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <div className="chip-picker">
      <ChipSlider
        denominations={CASINO_CHIP_DENOMINATIONS}
        balance={balance}
        selected={betSteps.at(-1)}
        disabled={disabled}
        canSelect={(amount) => amount <= balance && bet + amount <= maxBet}
        onSelect={onAdd}
      />
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

export function ChipSlider({
  denominations,
  pages,
  balance,
  selected,
  disabled = false,
  canSelect,
  onSelect,
  onPageChange,
}: {
  denominations?: readonly number[];
  pages?: ReadonlyArray<ReadonlyArray<number>>;
  balance: number;
  selected?: number;
  disabled?: boolean;
  canSelect?: (amount: number) => boolean;
  onSelect: (amount: number) => void;
  onPageChange?: (page: number) => void;
}) {
  const chipPages = useMemo(
    () => pages ?? chunkChipPages(denominations ?? CASINO_CHIP_DENOMINATIONS),
    [denominations, pages],
  );
  const initialPage = chipPageForBalance(chipPages, balance);
  const [localPage, setLocalPage] = useState(initialPage);
  const initialized = useRef(balance > 0);
  const page = Math.min(localPage, Math.max(0, chipPages.length - 1));
  const currentPage = chipPages[page] ?? [];
  const previousDisabled = disabled || page <= 0;
  const nextDisabled = disabled || page >= chipPages.length - 1;
  const selectPage = (nextPage: number) => {
    const next = Math.max(0, Math.min(chipPages.length - 1, nextPage));
    if (next === page) return;
    setLocalPage(next);
    onPageChange?.(next);
  };

  useEffect(() => {
    if (initialized.current || balance <= 0 || !chipPages.length) return;
    initialized.current = true;
    setLocalPage(chipPageForBalance(chipPages, balance));
  }, [balance, chipPages]);

  if (!chipPages.length) return null;

  return (
    <>
      <button
        type="button"
        className="icon-button chip-range-button"
        disabled={previousDisabled}
        onClick={() => selectPage(page - 1)}
        title="Afficher les jetons précédents"
        aria-label="Afficher les jetons précédents"
      >
        <ChevronLeft size={17} />
      </button>
      {currentPage.map((amount) => (
        <Chip
          key={amount}
          amount={amount}
          selected={selected === amount}
          disabled={disabled || !(canSelect?.(amount) ?? amount <= balance)}
          onClick={onSelect}
        />
      ))}
      <button
        type="button"
        className="icon-button chip-range-button"
        disabled={nextDisabled}
        onClick={() => selectPage(page + 1)}
        title="Afficher les jetons suivants"
        aria-label="Afficher les jetons suivants"
      >
        <ChevronRight size={17} />
      </button>
    </>
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

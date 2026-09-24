"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  disabled,
  onSelect,
}: {
  bet: number;
  maxBet: number;
  balance: number;
  disabled: boolean;
  onSelect: (amount: number) => void;
}) {
  return (
    <div className="chip-picker">
      <ChipSlider
        denominations={CASINO_CHIP_DENOMINATIONS}
        balance={balance}
        selected={bet}
        disabled={disabled}
        canSelect={(amount) => amount <= balance && amount <= maxBet}
        onSelect={onSelect}
      />
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

/**
 * Render a dock popover outside scroll and clipping containers, while keeping
 * it aligned to the control that opened it.
 */
export function GamePopoverPortal({
  anchorRef,
  panelRef,
  open,
  id,
  className,
  contextClassName,
  panelLabel,
  children,
}: {
  anchorRef: { current: HTMLDivElement | null };
  panelRef: { current: HTMLDivElement | null };
  open: boolean;
  id: string;
  className: string;
  contextClassName?: string;
  panelLabel: string;
  children: ReactNode;
}) {
  const [placement, setPlacement] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    ready: boolean;
  }>({ left: 0, top: 0, maxHeight: 0, ready: false });
  const [isMobile, setIsMobile] = useState(false);

  useLayoutEffect(() => {
    const updateViewportMode = () =>
      setIsMobile(window.matchMedia("(max-width: 700px)").matches);
    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useLayoutEffect(() => {
    if (!open || !isMobile) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const anchorRect = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = panel.offsetWidth;
      const edge = 12;
      const gap = 12;
      const availableAbove = Math.max(0, anchorRect.top - edge - gap);
      const availableBelow = Math.max(
        0,
        viewportHeight - anchorRect.bottom - edge - gap,
      );
      const openAbove =
        panel.scrollHeight <= availableAbove ||
        availableAbove >= availableBelow;
      const maxHeight = Math.floor(openAbove ? availableAbove : availableBelow);
      const panelHeight = Math.min(panel.scrollHeight, maxHeight);
      const left = Math.max(
        edge,
        Math.min(
          anchorRect.right - panelWidth,
          viewportWidth - panelWidth - edge,
        ),
      );
      const top = openAbove
        ? anchorRect.top - panelHeight - gap
        : anchorRect.bottom + gap;

      const computed = window.getComputedStyle(anchor);
      const context = panel.parentElement;
      if (context) {
        for (const token of [
          "--panel",
          "--text",
          "--muted",
          "--border",
          "--mines-accent",
          "--mines-accent-deep",
          "--mines-accent-soft",
          "--mines-gold",
          "--mines-panel",
          "--mines-panel-raised",
          "--tower-gold",
        ]) {
          const value = computed.getPropertyValue(token).trim();
          if (value) context.style.setProperty(token, value);
        }
      }

      setPlacement((current) =>
        current.ready &&
        current.left === left &&
        current.top === top &&
        current.maxHeight === maxHeight
          ? current
          : { left, top, maxHeight, ready: true },
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    if (observer && anchorRef.current) observer.observe(anchorRef.current);
    if (observer && panelRef.current) observer.observe(panelRef.current);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      observer?.disconnect();
    };
  }, [anchorRef, isMobile, open, panelRef]);

  if (!open || typeof document === "undefined") return null;

  if (!isMobile) {
    return (
      <div
        ref={panelRef}
        id={id}
        className={className}
        role="dialog"
        aria-label={panelLabel}
      >
        {children}
      </div>
    );
  }

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: placement.top,
    right: "auto",
    bottom: "auto",
    left: placement.left,
    zIndex: 70,
    maxHeight: placement.ready ? placement.maxHeight : undefined,
    overflowY: "auto",
    visibility: placement.ready ? "visible" : "hidden",
  };

  return createPortal(
    <div className={contextClassName} style={{ display: "contents" }}>
      <div
        ref={panelRef}
        id={id}
        className={className}
        role="dialog"
        aria-label={panelLabel}
        style={panelStyle}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Step slider of the club: a value picked among a handful of steps, with the
 * ticks and the scale under it. The styles were first written for the Mine,
 * which still carries its own copy of this markup.
 */
export function GameStepSlider({
  values,
  value,
  disabled = false,
  ariaLabel,
  summary,
  format = (step: number) => String(step),
  hints,
  onChange,
}: {
  values: readonly number[];
  value: number;
  disabled?: boolean;
  ariaLabel: string;
  /** Large read-out above the track. */
  summary: ReactNode;
  format?: (step: number) => string;
  /** Captions under the ends of the track. */
  hints?: readonly [ReactNode, ReactNode];
  onChange: (value: number) => void;
}) {
  const last = Math.max(1, values.length - 1);
  const index = Math.max(0, values.indexOf(value));
  const progress = (index / last) * 100;

  const selectAt = (position: number) => {
    const next = values[Math.round(position * last)];
    if (next !== undefined && next !== value) onChange(next);
  };
  const fromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    selectAt(
      bounds.width
        ? Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
        : 0,
    );
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = Math.min(last, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    if (values[next] !== undefined) onChange(values[next]);
  };

  return (
    <>
      <div className="mines-difficulty-summary" aria-live="polite">
        <b>{summary}</b>
      </div>
      <div
        className={`mines-difficulty-slider ${disabled ? "is-disabled" : ""}`.trim()}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={values[0]}
        aria-valuemax={values[values.length - 1]}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-disabled={disabled}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            fromPointer(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <span className="mines-difficulty-track" />
        <span
          className="mines-difficulty-fill"
          style={{ width: `${progress}%` }}
        />
        <span className="mines-difficulty-ticks" aria-hidden="true">
          {values.map((step, position) => (
            <i
              key={step}
              className={position <= index ? "is-passed" : ""}
              style={{ left: `${(position / last) * 100}%` }}
            />
          ))}
        </span>
        <span
          className="mines-difficulty-thumb"
          style={{ left: `${progress}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mines-difficulty-scale" aria-hidden="true">
        {values.map((step, position) => (
          <span
            key={step}
            className={`${position === index ? "is-selected" : ""} ${
              position === 0 ? "is-first" : ""
            } ${position === last ? "is-last" : ""}`.trim()}
            style={{ left: `${(position / last) * 100}%` }}
          >
            {format(step)}
          </span>
        ))}
      </div>
      {hints && (
        <div className="mines-difficulty-hint" aria-hidden="true">
          <span>{hints[0]}</span>
          <span>{hints[1]}</span>
        </div>
      )}
    </>
  );
}

/**
 * Dock control that opens a panel above the bar, as the Mine does for its
 * pattern: a trigger showing the current setting, and the panel itself.
 */
export function GamePopoverControl({
  id,
  icon,
  title,
  status,
  badge,
  running = false,
  disabled = false,
  panelLabel,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  status: ReactNode;
  badge?: ReactNode;
  running?: boolean;
  disabled?: boolean;
  panelLabel: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        !container.current?.contains(event.target as Node) &&
        !panel.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      ref={container}
      className={`mines-loop-control ${running ? "is-running" : ""} ${
        open ? "is-open" : ""
      }`.trim()}
    >
      <button
        type="button"
        className="mines-pattern-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="mines-pattern-trigger-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="mines-pattern-trigger-copy">
          <b>{title}</b>
          <small>{status}</small>
        </span>
        {badge !== undefined && (
          <span className="mines-pattern-trigger-count">{badge}</span>
        )}
        <ChevronDown
          size={14}
          className="mines-pattern-trigger-chevron"
          aria-hidden="true"
        />
      </button>
      <GamePopoverPortal
        anchorRef={container}
        panelRef={panel}
        open={open}
        id={id}
        className="mines-pattern-popover"
        contextClassName={`mines-loop-control ${running ? "is-running" : ""} ${open ? "is-open" : ""}`.trim()}
        panelLabel={panelLabel}
      >
        {children(() => setOpen(false))}
      </GamePopoverPortal>
    </div>
  );
}

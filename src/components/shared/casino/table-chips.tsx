"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { casinoChipStackForAmount } from "@/lib/chips";
import { credits } from "@/lib/rules";
import { motionDuration } from "./motion";

export const AnimatedTableChip = memo(
  function AnimatedTableChip({
    amount,
    maximum,
    className,
    placeholder,
  }: {
    amount: number;
    maximum: number;
    className: string;
    placeholder: ReactNode;
  }) {
    const [renderedAmount, setRenderedAmount] = useState<number | null>(
      amount > 0 ? amount : null,
    );
    const [exiting, setExiting] = useState(false);
    const exitTimer = useRef<number | null>(null);

    useEffect(() => {
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }

      if (amount > 0) {
        setRenderedAmount(amount);
        setExiting(false);
        return;
      }

      if (renderedAmount === null) {
        setExiting(false);
        return;
      }

      setExiting(true);
      exitTimer.current = window.setTimeout(
        () => {
          exitTimer.current = null;
          setRenderedAmount(null);
          setExiting(false);
        },
        motionDuration(180, 120),
      );

      return () => {
        if (exitTimer.current !== null) {
          window.clearTimeout(exitTimer.current);
          exitTimer.current = null;
        }
      };
    }, [amount, renderedAmount]);

    if (renderedAmount === null) {
      return <span className="spot-placeholder">{placeholder}</span>;
    }

    return (
      <TableChipStack
        amount={renderedAmount}
        maximum={maximum}
        className={`${className} ${exiting ? "is-exiting" : ""}`}
      />
    );
  },
  (left, right) =>
    left.amount === right.amount &&
    left.maximum === right.maximum &&
    left.className === right.className,
);

export const TableChipStack = memo(function TableChipStack({
  amount,
  maximum,
  className = "",
}: {
  amount: number;
  maximum: number;
  className?: string;
}) {
  const stage = casinoChipStackForAmount(amount, maximum);
  return (
    <span
      key={stage.index}
      className={`table-chip chip-stack-stage-${stage.index} ${className}`}
      data-chip-stage={stage.index}
    >
      <span className="table-chip-pile" aria-hidden="true">
        {stage.columns.map((column, columnIndex) => (
          <span
            className={`table-chip-column chip-${column.denomination}`}
            key={`${column.denomination}-${columnIndex}`}
            style={
              {
                "--chip-column-left": `${((columnIndex + 1) / (stage.columns.length + 1)) * 100}%`,
                "--chip-column-index": columnIndex,
              } as CSSProperties
            }
          >
            {Array.from({ length: column.layers }, (_, layer) => (
              <i
                className="table-chip-disc"
                key={layer}
                style={{ "--chip-layer": layer } as CSSProperties}
              />
            ))}
          </span>
        ))}
      </span>
      <span className="table-chip-amount">{credits(amount)}</span>
    </span>
  );
});

export function SettlementChipAnimation({
  stake,
  payout,
  maximum,
  side = false,
}: {
  stake: number;
  payout: number;
  maximum: number;
  side?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const profit = Math.max(0, payout - stake);
  const chipClass = `settlement-chip ${side ? "side-chip" : ""}`;

  useLayoutEffect(() => {
    const root = ref.current;
    // The Roulette reuses this settlement: its bank is the top of the felt
    // and the winning pile stays on its spot, so it has no player target.
    const table = root?.closest(".table-stage, .roulette-stage");
    const seat = root?.closest(".seat");
    const bank = table?.querySelector(".dealer-cards, .roulette-pot-anchor");
    const player = seat?.querySelector(".seat-name");
    if (!root || !bank) return;

    const origin = root.getBoundingClientRect();
    const bankRect = bank.getBoundingClientRect();
    const centerX = origin.left + origin.width / 2;
    const centerY = origin.top + origin.height / 2;
    root.style.setProperty(
      "--settlement-bank-x",
      `${bankRect.left + bankRect.width / 2 - centerX}px`,
    );
    root.style.setProperty(
      "--settlement-bank-y",
      `${bankRect.top + bankRect.height / 2 - centerY}px`,
    );
    if (!player) return;
    const playerRect = player.getBoundingClientRect();
    root.style.setProperty(
      "--settlement-player-x",
      side ? `${playerRect.left + playerRect.width / 2 - centerX}px` : "0px",
    );
    root.style.setProperty(
      "--settlement-player-y",
      `${playerRect.top + playerRect.height / 2 - centerY}px`,
    );
  }, [payout, side, stake]);

  return (
    <span
      ref={ref}
      className={`settlement-chips ${side ? "side-settlement" : ""}`}
      aria-hidden="true"
    >
      {profit > 0 && (
        <TableChipStack
          amount={profit}
          maximum={maximum}
          className={`${chipClass} settlement-incoming`}
        />
      )}
      {payout > 0 ? (
        <>
          <TableChipStack
            amount={stake}
            maximum={maximum}
            className={`${chipClass} settlement-stake`}
          />
          <TableChipStack
            amount={payout}
            maximum={maximum}
            className={`${chipClass} settlement-return`}
          />
        </>
      ) : (
        <TableChipStack
          amount={stake}
          maximum={maximum}
          className={`${chipClass} settlement-loss`}
        />
      )}
    </span>
  );
}

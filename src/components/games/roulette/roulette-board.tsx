"use client";

import { credits } from "@/lib/rules";
import { useState, type CSSProperties } from "react";
import { ROULETTE_FX } from "./roulette-fx";
import {
  ROULETTE_MAX_PER_SPOT,
  ROULETTE_PAYOUTS,
  rouletteBetId,
  rouletteBetLabel,
  rouletteBetWins,
  type RouletteBet,
  type RouletteBetKind,
} from "@/lib/roulette";
import type { RouletteTableState } from "@/lib/types";
import {
  SettlementChipAnimation,
  TableChipStack,
} from "../../shared/casino/table-chips";
import { numberTone } from "./roulette-wheel";

export type Target = { kind: RouletteBetKind; selection: string };

export type BoardProps = {
  mine: Map<string, number>;
  /** Chips of the other players, drawn translucent in another colour. */
  others: Map<string, number>;
  chip: number;
  canBet: boolean;
  result: number | null;
  phase: RouletteTableState["phase"];
  /** Spot under the pointer, set by the board itself. */
  previewId?: string | null;
  onPlace: (kind: RouletteBetKind, selection: string) => void;
  onRemove: (kind: RouletteBetKind, selection: string) => void;
};

/** Row from the top of the layout: 3, 6, 9… sit on the first row. */
const rowOf = (number: number) => 2 - ((number - 1) % 3);
const columnOf = (number: number) => Math.ceil(number / 3);
const NUMBERS = Array.from({ length: 36 }, (_, index) => index + 1);
const EDGE = 0.26;
const OUTSIDE = [
  ["half", "low", "1 – 18", ""],
  ["parity", "even", "Pair", ""],
  ["color", "red", "", "tone-red"],
  ["color", "black", "", "tone-black"],
  ["parity", "odd", "Impair", ""],
  ["half", "high", "19 – 36", ""],
] as const;

/**
 * Aiming near the edge of a number plays a split with its neighbour, near a
 * corner the four numbers around it, as on online roulette tables.
 */
export function targetAt(number: number, x: number, y: number): Target {
  const column = columnOf(number);
  const row = rowOf(number);
  const dx = x < EDGE ? -1 : x > 1 - EDGE ? 1 : 0;
  const dy = y < EDGE ? -1 : y > 1 - EDGE ? 1 : 0;
  // The left edge of the first column borders the zero: zero split.
  if (dx === -1 && column === 1)
    return { kind: "split", selection: `0-${number}` };
  const side =
    dx && column + dx >= 1 && column + dx <= 12 ? number + dx * 3 : null;
  // Up the layout is number + 1 (3 sits above 2), down is number - 1.
  const vertical = dy && row + dy >= 0 && row + dy <= 2 ? number - dy : null;
  const join = (numbers: number[]) =>
    [...numbers].sort((a, b) => a - b).join("-");
  if (side !== null && vertical !== null)
    return {
      kind: "corner",
      selection: join([number, side, vertical, side - dy]),
    };
  if (side !== null) return { kind: "split", selection: join([number, side]) };
  if (vertical !== null)
    return { kind: "split", selection: join([number, vertical]) };
  return { kind: "straight", selection: String(number) };
}

/** Aiming at the right edge of the zero plays it with 1, 2 or 3. */
export function zeroTargetAt(x: number, y: number): Target {
  if (x <= 1 - EDGE) return { kind: "straight", selection: "0" };
  const row = Math.min(2, Math.max(0, Math.floor(y * 3)));
  return { kind: "split", selection: `0-${3 - row}` };
}

function pointerTarget(
  number: number,
  event: { clientX: number; clientY: number; currentTarget: Element },
) {
  const box = event.currentTarget.getBoundingClientRect();
  return targetAt(
    number,
    (event.clientX - box.left) / box.width,
    (event.clientY - box.top) / box.height,
  );
}

function zeroPointerTarget(event: {
  clientX: number;
  clientY: number;
  currentTarget: Element;
}) {
  const box = event.currentTarget.getBoundingClientRect();
  return zeroTargetAt(
    (event.clientX - box.left) / box.width,
    (event.clientY - box.top) / box.height,
  );
}

/** Where the chips of a split or corner sit, on the lines between numbers. */
function anchorOf({ kind, selection }: Target) {
  const numbers = selection.split("-").map(Number);
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  // The zero spans the three rows: a zero split sits on its neighbour's row,
  // on the line between the zero and the first column (column 0 here).
  return {
    left: `${((average(numbers.map(columnOf)) - 0.5) * 100) / 12}%`,
    top: `${((average(numbers.filter((number) => number).map(rowOf)) + 0.5) * 100) / 3}%`,
    shape: kind === "corner" ? "is-corner" : "is-split",
  };
}

function Chips({ id, board }: { id: string; board: BoardProps }) {
  const amount = board.mine.get(id) ?? 0;
  const others = board.others.get(id) ?? 0;
  if (!amount && !others) return null;
  // Once the ball is launched every chip of a spot joins one pile. At the
  // result the losing piles are taken over by RouletteFx, while the winnings
  // merge into the winning piles as on the Blackjack table, and stay there.
  if (board.phase !== "betting") {
    const [kind, selection] = id.split(":") as [RouletteBetKind, string];
    if (board.result !== null) {
      if (!rouletteBetWins({ kind, selection }, board.result)) return null;
      const stake = amount + others;
      const gain = stake * ROULETTE_PAYOUTS[kind];
      return (
        <>
          <SettlementChipAnimation
            stake={stake}
            payout={stake + gain}
            maximum={ROULETTE_MAX_PER_SPOT / 2}
          />
          <span
            className={`roulette-win-tag ${kind === "straight" ? "" : "is-below"}`}
          >
            +{credits(gain)}
          </span>
        </>
      );
    }
    return (
      <TableChipStack
        amount={amount + others}
        maximum={ROULETTE_MAX_PER_SPOT / 2}
        className="roulette-chip"
      />
    );
  }
  // Other players' chips stay discreet, and fade further under my own chips
  // or under the spot I am aiming at.
  const faint = amount > 0 || board.previewId === id;
  return (
    <>
      {others > 0 && (
        <TableChipStack
          amount={others}
          maximum={ROULETTE_MAX_PER_SPOT / 2}
          className={`roulette-chip roulette-chip-other ${amount ? "is-behind" : ""} ${faint ? "is-faint" : ""}`}
        />
      )}
      {amount > 0 && (
        <TableChipStack
          amount={amount}
          maximum={ROULETTE_MAX_PER_SPOT / 2}
          className="roulette-chip"
        />
      )}
    </>
  );
}

function spotLabel(target: Target, board: BoardProps) {
  const id = rouletteBetId(target);
  const amount = board.mine.get(id) ?? 0;
  const others = board.others.get(id) ?? 0;
  return `${rouletteBetLabel(target)} · paie ${ROULETTE_PAYOUTS[target.kind]} pour 1${amount ? ` · ${amount} crédits misés` : ""}${others ? ` · ${others} crédits des autres joueurs` : ""}`;
}

/** Every winning spot lights up once the number is out, chips or not. */
function outcomeClass(target: Target, result: number | null) {
  if (result === null) return "";
  return rouletteBetWins(target, result) ? "is-won" : "is-lost";
}

export function RouletteBoard(props: BoardProps) {
  const [preview, setPreview] = useState<Target | null>(null);
  const board: BoardProps = {
    ...props,
    previewId: preview && props.canBet ? rouletteBetId(preview) : null,
  };
  const covered = (number: number) =>
    !!preview && board.canBet && rouletteBetWins(preview, number);
  const hover = (target: Target | null) =>
    setPreview((current) =>
      current?.kind === target?.kind && current?.selection === target?.selection
        ? current
        : target,
    );
  const spotProps = (target: Target) => ({
    type: "button" as const,
    "data-bet": rouletteBetId(target),
    disabled: !board.canBet,
    "aria-label": spotLabel(target, board),
    title: `${rouletteBetLabel(target)} · ${ROULETTE_PAYOUTS[target.kind]} pour 1`,
    onPointerEnter: () => hover(target),
    onClick: () => board.onPlace(target.kind, target.selection),
    onContextMenu: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      board.onRemove(target.kind, target.selection);
    },
  });
  // Splits and corners carrying chips, mine or the other players'.
  const inside = [
    ...new Set([...board.mine.keys(), ...board.others.keys()]),
  ].filter((id) => id.startsWith("split:") || id.startsWith("corner:"));
  const previewAnchor =
    preview && preview.kind !== "straight" && board.canBet
      ? anchorOf(preview)
      : null;

  return (
    <div className="roulette-layout-scroll">
      <div
        className={`roulette-layout ${board.result !== null ? "has-result" : ""}`}
        style={
          {
            "--roulette-winnings-delay": `${ROULETTE_FX.winnings}ms`,
          } as CSSProperties
        }
        data-testid="roulette-board"
        onPointerLeave={() => hover(null)}
      >
        <button
          {...spotProps({ kind: "straight", selection: "0" })}
          className={`roulette-spot roulette-zero ${outcomeClass({ kind: "straight", selection: "0" }, board.result)} ${covered(0) ? "is-preview" : ""}`}
          onPointerMove={(event) => hover(zeroPointerTarget(event))}
          onClick={(event) => {
            // Keyboard activation has no pointer position: plain zero.
            const target =
              event.detail === 0
                ? { kind: "straight" as const, selection: "0" }
                : zeroPointerTarget(event);
            board.onPlace(target.kind, target.selection);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            const target = zeroPointerTarget(event);
            board.onRemove(target.kind, target.selection);
          }}
        >
          <span className="roulette-number">0</span>
          <Chips id="straight:0" board={board} />
        </button>
        <div className="roulette-numbers">
          {NUMBERS.map((number) => {
            const straight: Target = {
              kind: "straight",
              selection: String(number),
            };
            return (
              <button
                key={number}
                type="button"
                data-bet={rouletteBetId(straight)}
                disabled={!board.canBet}
                aria-label={spotLabel(straight, board)}
                className={`roulette-spot roulette-cell ${numberTone(number)} ${outcomeClass(straight, board.result)} ${covered(number) ? "is-preview" : ""}`}
                style={{
                  gridColumn: columnOf(number),
                  gridRow: rowOf(number) + 1,
                }}
                onPointerMove={(event) => hover(pointerTarget(number, event))}
                onClick={(event) => {
                  // Keyboard activation has no pointer position: plain number.
                  const target =
                    event.detail === 0
                      ? straight
                      : pointerTarget(number, event);
                  board.onPlace(target.kind, target.selection);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const target = pointerTarget(number, event);
                  board.onRemove(target.kind, target.selection);
                }}
              >
                <span className="roulette-number">{number}</span>
                <Chips id={rouletteBetId(straight)} board={board} />
              </button>
            );
          })}
          {inside.map((id) => {
            const [kind, selection] = id.split(":") as [
              RouletteBetKind,
              string,
            ];
            const anchor = anchorOf({ kind, selection });
            return (
              <span
                key={id}
                data-bet={id}
                className={`roulette-anchor ${anchor.shape} ${outcomeClass({ kind, selection }, board.result)}`}
                style={{ left: anchor.left, top: anchor.top }}
              >
                <Chips id={id} board={board} />
              </span>
            );
          })}
          {previewAnchor && (
            <span
              className={`roulette-anchor roulette-anchor-preview ${previewAnchor.shape}`}
              style={{ left: previewAnchor.left, top: previewAnchor.top }}
            >
              <span className="roulette-preview-label">
                {rouletteBetLabel(preview!)} · +{board.chip}
              </span>
            </span>
          )}
        </div>
        {[3, 2, 1].map((column, index) => {
          const target: Target = { kind: "column", selection: String(column) };
          return (
            <button
              key={column}
              {...spotProps(target)}
              className={`roulette-spot roulette-outside roulette-column ${outcomeClass(target, board.result)}`}
              style={{ gridColumn: 14, gridRow: index + 1 }}
            >
              <span>2:1</span>
              <Chips id={rouletteBetId(target)} board={board} />
            </button>
          );
        })}
        {[1, 2, 3].map((dozen) => {
          const target: Target = { kind: "dozen", selection: String(dozen) };
          return (
            <button
              key={dozen}
              {...spotProps(target)}
              className={`roulette-spot roulette-outside ${outcomeClass(target, board.result)}`}
              style={{
                gridColumn: `${2 + (dozen - 1) * 4} / span 4`,
                gridRow: 4,
              }}
            >
              <span>
                {dozen}
                <sup>{dozen === 1 ? "re" : "e"}</sup> douzaine
              </span>
              <Chips id={rouletteBetId(target)} board={board} />
            </button>
          );
        })}
        {OUTSIDE.map(([kind, selection, text, tone], index) => {
          const target: Target = { kind, selection };
          return (
            <button
              key={`${kind}:${selection}`}
              {...spotProps(target)}
              className={`roulette-spot roulette-outside ${tone} ${outcomeClass(target, board.result)}`}
              style={{ gridColumn: `${2 + index * 2} / span 2`, gridRow: 5 }}
            >
              {text ? (
                <span>{text}</span>
              ) : (
                <span className={`roulette-diamond ${tone}`} />
              )}
              <Chips id={rouletteBetId(target)} board={board} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function betMap(bets: RouletteBet[], into = new Map<string, number>()) {
  for (const bet of bets) {
    const id = rouletteBetId(bet);
    into.set(id, (into.get(id) ?? 0) + bet.amount);
  }
  return into;
}

/* ── Page ────────────────────────────────────────────────────────────── */

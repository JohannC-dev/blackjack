"use client";

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { CASINO_CHIP_DENOMINATIONS } from "@/lib/chips";
import {
  ROULETTE_MAX_PER_SPOT,
  rouletteBetId,
  rouletteBetWins,
} from "@/lib/roulette";
import type { RouletteTableState } from "@/lib/types";
import { TableChipStack } from "./casino";

type Point = { x: number; y: number };
type Geometry = {
  cell: number;
  bottom: number;
  spots: Record<string, Point>;
};

/** Chip choreography, in ms from the moment the number is out. */
export const ROULETTE_FX = {
  /** First each losing pile lifts off its spot… */
  rake: 400,
  rakeStagger: 45,
  lift: 280,
  /** …and falls away in loose chips. */
  maxDrops: 40,
  /** After a short pause the winnings arrive (Blackjack settlement)… */
  winnings: 2300,
  /** …and merge into the winning piles about a second later. */
  merge: 3300,
};

/** Positions are taken from the rendered felt, relative to the stage. */
function measure(stage: HTMLElement): Geometry | null {
  const box = stage.getBoundingClientRect();
  const cell = stage.querySelector(".roulette-cell");
  if (!cell) return null;
  const spots: Record<string, Point> = {};
  for (const element of stage.querySelectorAll<HTMLElement>("[data-bet]")) {
    const rect = element.getBoundingClientRect();
    spots[element.dataset.bet!] = {
      x: rect.left + rect.width / 2 - box.left,
      y: rect.top + rect.height / 2 - box.top,
    };
  }
  return {
    cell: cell.getBoundingClientRect().width,
    bottom: box.height,
    spots,
  };
}

/** Stable pseudo-random value, so a re-render never reshuffles the rain. */
function noise(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Losing chips once the number is out: every losing pile lifts off its own
 * spot and falls away in a rain of loose chips, before the winnings merge
 * into the winning piles (see Chips in roulette-casino).
 */
export function RouletteFx({
  table,
  stageRef,
}: {
  table: RouletteTableState | null;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const phase = table?.phase;
  const round = table?.round;
  const layoutKey = table?.players
    .map((player) => `${player.id}:${player.bets.length}`)
    .join(",");

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setGeometry(measure(stage));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [stageRef, phase, round, layoutKey]);

  // While the ball turns the chips stay on their spots (see Chips).
  if (!table || !geometry || table.phase !== "settled") return null;
  const number = table.number;
  if (number === null) return null;
  const losing = new Map<string, number>();
  for (const player of table.players)
    for (const bet of player.bets)
      if (!rouletteBetWins(bet, number)) {
        const id = rouletteBetId(bet);
        losing.set(id, (losing.get(id) ?? 0) + bet.amount);
      }
  const piles = [...losing]
    .filter(([id]) => geometry.spots[id])
    .map(([id, amount], index) => ({
      id,
      amount,
      spot: geometry.spots[id],
      delay: ROULETTE_FX.rake + index * ROULETTE_FX.rakeStagger,
      // Bigger piles shed more chips, within an overall budget.
      count: Math.min(6, Math.max(2, Math.round(amount / 15))),
    }));
  if (!piles.length) return null;

  const dropSize = geometry.cell * 0.5;
  const budget = piles.reduce((sum, { count }) => sum + count, 0);
  const scale = Math.min(1, ROULETTE_FX.maxDrops / budget);
  let drop = 0;
  const rain = piles.flatMap(({ spot, delay, count }) =>
    Array.from({ length: Math.max(1, Math.round(count * scale)) }, () => ({
      index: drop++,
      spot,
      start: delay + ROULETTE_FX.lift,
    })),
  );

  return (
    <div
      className="roulette-fx"
      style={{ "--cell": `${geometry.cell}px` } as CSSProperties}
      key={`settle-${table.round}`}
    >
      {piles.map(({ id, amount, spot, delay }) => (
        <span
          key={id}
          className="roulette-fx-pile is-lift"
          style={
            {
              left: spot.x,
              top: spot.y,
              "--delay": `${delay}ms`,
              "--dur": `${ROULETTE_FX.lift}ms`,
            } as CSSProperties
          }
        >
          <TableChipStack
            amount={amount}
            maximum={ROULETTE_MAX_PER_SPOT / 2}
            className="roulette-chip"
          />
        </span>
      ))}
      {rain.map(({ index, spot, start }) => {
        const denomination =
          CASINO_CHIP_DENOMINATIONS[
            Math.floor(noise(index, 1) * CASINO_CHIP_DENOMINATIONS.length)
          ];
        return (
          <span
            key={index}
            className={`roulette-rain-drop chip-${denomination}`}
            style={
              {
                left: spot.x + (noise(index, 2) - 0.5) * dropSize,
                top: spot.y - geometry.cell * 0.45,
                "--size": `${dropSize}px`,
                "--x": `${(noise(index, 3) - 0.5) * geometry.cell * 3}px`,
                "--rise": `${-10 - noise(index, 4) * 18}px`,
                "--fall": `${geometry.bottom - spot.y + 60}px`,
                "--rot": `${(noise(index, 5) - 0.5) * 900}deg`,
                "--delay": `${start + noise(index, 6) * 160}ms`,
                "--dur": `${800 + noise(index, 7) * 450}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

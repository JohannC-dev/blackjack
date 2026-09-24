"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import { plinkoSlotHeat, plinkoSlotLabel, type PlinkoRisk } from "@/lib/plinko";
import type { PlinkoDrop } from "@/lib/types";

export type PlinkoBoardHandle = {
  /** Replays a settled drop; `delay` staggers the balls of a same batch. */
  drop: (drop: PlinkoDrop, delay?: number) => void;
  /** Whether balls are still falling, for a caller waiting on a quiet board. */
  busy: () => boolean;
  clear: () => void;
};

/**
 * Rows of pegs sit on an equilateral grid: one row down is `0.866` of the gap
 * between two pegs, which is what keeps the triangle from looking stretched.
 */
const ROW_RATIO = 0.866;
/** Fall time of a whole board, in milliseconds. */
const fallDuration = (rows: number) => 860 + rows * 40;
/** How far above the first peg a ball is released, in rows. */
const DROP_IN_ROWS = 1.35;
/** How long a struck peg keeps glowing. */
const PEG_FLASH_MS = 260;
/** Past this, a ball settles without falling: the board stays readable. */
const MAX_LIVE_BALLS = 64;

type Ball = {
  id: string;
  path: number[];
  slot: number;
  rows: number;
  /** Timestamp at which the ball is released above the first peg. */
  start: number;
  /** Pegs already struck, so each one flashes exactly once. */
  struck: number;
  landed: boolean;
};

type Flash = { x: number; y: number; at: number };

type Layout = {
  width: number;
  height: number;
  /** Gap between two pegs of a same row. */
  spacing: number;
  rowHeight: number;
  /** Centre of the triangle and of the slot row below it. */
  centreX: number;
  topY: number;
  /** Width of the slot row, so the badges line up with the last peg row. */
  boardWidth: number;
  pegRadius: number;
  ballRadius: number;
};

/** Width of a character of the badge font, in ems of its own size. */
const CHARACTER_WIDTH: Record<string, number> = { ".": 0.3, x: 0.56 };

/**
 * Type size of the badges. A slot is only as wide as a peg gap, and the
 * labels run from `0.6x` to `1317`: the whole row takes the size that fits
 * its longest label, so the strip reads as one line rather than a staircase.
 */
function slotFontSize(labels: readonly string[], spacing: number) {
  const widest = labels.reduce(
    (widest, label) =>
      Math.max(
        widest,
        [...label].reduce(
          (total, character) => total + (CHARACTER_WIDTH[character] ?? 0.62),
          0,
        ),
      ),
    1,
  );
  // The gap between two badges and their padding are not text room.
  return Math.max(7, Math.min(13, (spacing - 9) / widest));
}

const COLOR_STOPS: ReadonlyArray<readonly [number, readonly number[]]> = [
  [0, [125, 224, 180]],
  [0.5, [240, 196, 84]],
  [1, [226, 86, 79]],
];

/** Cold centre to hot edges, on the club palette. */
function slotColor(heat: number) {
  let upper = 1;
  while (upper < COLOR_STOPS.length - 1 && heat > COLOR_STOPS[upper][0])
    upper++;
  const [fromHeat, from] = COLOR_STOPS[upper - 1];
  const [toHeat, to] = COLOR_STOPS[upper];
  const ratio = Math.min(
    1,
    Math.max(0, (heat - fromHeat) / (toHeat - fromHeat)),
  );
  const channel = (index: number) =>
    Math.round(from[index] + (to[index] - from[index]) * ratio);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/**
 * The triangle is sized by whichever of the two axes runs out first, then
 * centred: a wide panel keeps a tall narrow board rather than stretching it.
 */
function layoutFor(width: number, height: number, rows: number): Layout {
  // Half a gap of margin on each side, plus room for the ball at the edges.
  const fromWidth = width / (rows + 2.2);
  const fromHeight = height / ((rows + DROP_IN_ROWS + 0.6) * ROW_RATIO);
  const spacing = Math.max(6, Math.min(fromWidth, fromHeight));
  const rowHeight = spacing * ROW_RATIO;
  const boardWidth = spacing * (rows + 1);
  const dropIn = rowHeight * DROP_IN_ROWS;
  const used = dropIn + rows * rowHeight;
  return {
    width,
    height,
    spacing,
    rowHeight,
    centreX: width / 2,
    topY: dropIn + Math.max(0, (height - used - rowHeight * 0.6) / 2),
    boardWidth,
    pegRadius: Math.max(1.6, Math.min(4, spacing * 0.085)),
    ballRadius: Math.max(4, Math.min(11, spacing * 0.3)),
  };
}

/**
 * Centre of a ball that has bounced right `rights` times out of `bounces`.
 * After every bounce the ball sits on a peg of row `bounces`, never between
 * two of them — that is what makes the path read as real bounces.
 */
function bounceX(layout: Layout, rights: number, bounces: number) {
  return layout.centreX + (2 * rights - bounces) * (layout.spacing / 2);
}

function pegY(layout: Layout, row: number) {
  return layout.topY + row * layout.rowHeight;
}

/** Pegs never move: they are painted once per layout, on their own canvas. */
function paintPegs(
  canvas: HTMLCanvasElement,
  layout: Layout,
  rows: number,
  dpr: number,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, layout.width, layout.height);
  for (let row = 0; row < rows; row++) {
    const count = row + 3;
    const y = pegY(layout, row);
    for (let peg = 0; peg < count; peg++) {
      const x = layout.centreX + (peg - (count - 1) / 2) * layout.spacing;
      context.beginPath();
      context.arc(x, y, layout.pegRadius, 0, Math.PI * 2);
      context.fillStyle = "#efe9ff";
      context.fill();
    }
  }
}

/** One pre-rendered ball, so a hundred of them cost a hundred `drawImage`. */
function makeBallSprite(radius: number, dpr: number) {
  const size = Math.ceil(radius * 4 * dpr);
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext("2d");
  if (!context) return sprite;
  const centre = size / 2;
  const scaled = radius * dpr;
  const glow = context.createRadialGradient(
    centre,
    centre,
    scaled * 0.2,
    centre,
    centre,
    scaled * 2,
  );
  glow.addColorStop(0, "rgba(199, 169, 255, 0.5)");
  glow.addColorStop(1, "rgba(199, 169, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);
  const body = context.createRadialGradient(
    centre - scaled * 0.35,
    centre - scaled * 0.4,
    scaled * 0.15,
    centre,
    centre,
    scaled,
  );
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.45, "#cbb0ff");
  body.addColorStop(1, "#8d6ae0");
  context.beginPath();
  context.arc(centre, centre, scaled, 0, Math.PI * 2);
  context.fillStyle = body;
  context.fill();
  return sprite;
}

/** Halo of a struck peg, drawn on the ball layer for a fraction of a second. */
function makeFlashSprite(radius: number, dpr: number) {
  const size = Math.ceil(radius * 7 * dpr);
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext("2d");
  if (!context) return sprite;
  const centre = size / 2;
  const gradient = context.createRadialGradient(
    centre,
    centre,
    0,
    centre,
    centre,
    centre,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  gradient.addColorStop(0.35, "rgba(199, 169, 255, 0.45)");
  gradient.addColorStop(1, "rgba(199, 169, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return sprite;
}

export function PlinkoBoard({
  rows,
  risk,
  multipliers,
  highlight,
  handle,
  onLand,
}: {
  rows: number;
  risk: PlinkoRisk;
  multipliers: readonly number[];
  /** Slot lit by the latest landing, with a key that retriggers the flash. */
  highlight: { slot: number; key: number } | null;
  handle: Ref<PlinkoBoardHandle>;
  onLand: (drop: PlinkoDrop) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pegCanvas = useRef<HTMLCanvasElement>(null);
  const ballCanvas = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const ballsRef = useRef<Ball[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const pendingRef = useRef(new Map<string, PlinkoDrop>());
  const ballSprite = useRef<HTMLCanvasElement | null>(null);
  const flashSprite = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef(0);
  const dprRef = useRef(1);
  const reducedRef = useRef(false);
  const onLandRef = useRef(onLand);
  onLandRef.current = onLand;
  const [size, setSize] = useState({ width: 0, spacing: 0 });
  const labels = useMemo(() => multipliers.map(plinkoSlotLabel), [multipliers]);

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    flashesRef.current = [];
    const canvas = ballCanvas.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const step = useCallback(() => {
    frame.current = 0;
    const canvas = ballCanvas.current;
    const layout = layoutRef.current;
    const context = canvas?.getContext("2d");
    const ball = ballSprite.current;
    const flash = flashSprite.current;
    if (!canvas || !layout || !context || !ball || !flash) return;

    const now = performance.now();
    const dpr = dprRef.current;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const dropIn = layout.rowHeight * DROP_IN_ROWS;
    const ballSize = ball.width / dpr;
    const flashSize = flash.width / dpr;
    const alive: Ball[] = [];

    for (const item of ballsRef.current) {
      const elapsed = now - item.start;
      if (elapsed < 0) {
        alive.push(item);
        continue;
      }
      // Free fall from rest: the ball speeds up as it goes, like a real one.
      const total = fallDuration(item.rows);
      const gravity = (dropIn + item.rows * layout.rowHeight) / (total * total);
      const fallen = gravity * elapsed * elapsed;
      const y = layout.topY - dropIn + fallen;

      // Rows already cleared, from the distance fallen below the first peg.
      const depth = (fallen - dropIn) / layout.rowHeight;
      const bounces = Math.max(0, Math.min(item.rows, Math.floor(depth) + 1));
      let x: number;
      if (depth < 0) {
        x = layout.centreX;
      } else {
        let rights = 0;
        for (let index = 0; index < bounces - 1; index++)
          rights += item.path[index];
        const from = bounceX(layout, rights, bounces - 1);
        const to = bounceX(layout, rights + item.path[bounces - 1], bounces);
        // Constant horizontal speed between two pegs, as after a real bounce.
        x = from + (to - from) * Math.min(1, depth - (bounces - 1));
      }

      while (item.struck < bounces && item.struck < item.rows) {
        let rights = 0;
        for (let index = 0; index < item.struck; index++)
          rights += item.path[index];
        flashesRef.current.push({
          x: bounceX(layout, rights, item.struck),
          y: pegY(layout, item.struck),
          at: now,
        });
        item.struck += 1;
      }

      const fade =
        y > layout.height - layout.ballRadius
          ? Math.max(
              0,
              1 - (y - (layout.height - layout.ballRadius)) / layout.rowHeight,
            )
          : 1;
      context.globalAlpha = fade;
      context.drawImage(
        ball,
        x - ballSize / 2,
        y - ballSize / 2,
        ballSize,
        ballSize,
      );
      context.globalAlpha = 1;

      if (!item.landed && bounces >= item.rows) {
        item.landed = true;
        const settled = pendingRef.current.get(item.id);
        if (settled) {
          pendingRef.current.delete(item.id);
          onLandRef.current(settled);
        }
      }
      if (y < layout.height + layout.rowHeight) alive.push(item);
    }

    const flashes: Flash[] = [];
    for (const item of flashesRef.current) {
      const age = (now - item.at) / PEG_FLASH_MS;
      if (age >= 1) continue;
      context.globalAlpha = (1 - age) * 0.9;
      context.drawImage(
        flash,
        item.x - flashSize / 2,
        item.y - flashSize / 2,
        flashSize,
        flashSize,
      );
      flashes.push(item);
    }
    context.globalAlpha = 1;
    flashesRef.current = flashes;

    ballsRef.current = alive;
    // The loop only exists while balls do: an idle board costs nothing.
    if (alive.length || flashes.length)
      frame.current = requestAnimationFrame(step);
    else stop();
  }, [stop]);

  useImperativeHandle(
    handle,
    () => ({
      drop: (settled, delay = 0) => {
        if (reducedRef.current || ballsRef.current.length >= MAX_LIVE_BALLS) {
          onLandRef.current(settled);
          return;
        }
        pendingRef.current.set(settled.id, settled);
        ballsRef.current.push({
          id: settled.id,
          path: settled.path,
          slot: settled.slot,
          rows: settled.rows,
          start: performance.now() + delay,
          struck: 0,
          landed: false,
        });
        if (!frame.current) frame.current = requestAnimationFrame(step);
      },
      busy: () => ballsRef.current.length > 0,
      clear: () => {
        ballsRef.current = [];
        pendingRef.current.clear();
        stop();
      },
    }),
    [step, stop],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = media.matches;
      if (!media.matches) return;
      for (const settled of pendingRef.current.values())
        onLandRef.current(settled);
      pendingRef.current.clear();
      ballsRef.current = [];
      stop();
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [stop]);

  useEffect(() => {
    const frameElement = frameRef.current;
    const pegs = pegCanvas.current;
    const balls = ballCanvas.current;
    if (!frameElement || !pegs || !balls) return;

    const resize = () => {
      const rect = frameElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      dprRef.current = dpr;
      for (const canvas of [pegs, balls]) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      const layout = layoutFor(rect.width, rect.height, rows);
      layoutRef.current = layout;
      ballSprite.current = makeBallSprite(layout.ballRadius, dpr);
      flashSprite.current = makeFlashSprite(layout.pegRadius, dpr);
      setSize({ width: layout.boardWidth, spacing: layout.spacing });
      paintPegs(pegs, layout, rows, dpr);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(frameElement);
    return () => observer.disconnect();
  }, [rows]);

  /** Changing the board mid-flight would send balls to the wrong slots. */
  useEffect(() => {
    ballsRef.current = [];
    pendingRef.current.clear();
    stop();
  }, [rows, stop]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="plinko-board" data-risk={risk}>
      <div className="plinko-pins" ref={frameRef}>
        <canvas ref={pegCanvas} className="plinko-layer" aria-hidden="true" />
        <canvas ref={ballCanvas} className="plinko-layer" aria-hidden="true" />
      </div>
      <div
        className="plinko-slots"
        style={
          {
            width: size.width ? `${size.width}px` : undefined,
            fontSize: `${slotFontSize(labels, size.spacing).toFixed(1)}px`,
            gridTemplateColumns: `repeat(${rows + 1}, minmax(0, 1fr))`,
            "--slot-size": `${size.spacing}px`,
          } as CSSProperties
        }
        aria-label="Multiplicateurs par case"
      >
        {multipliers.map((multiplier, slot) => {
          const hit = highlight?.slot === slot;
          return (
            <span
              // Remounting the hit badge replays its flash on every landing.
              key={hit ? `${slot}-${highlight.key}` : slot}
              className={`plinko-slot ${hit ? "is-hit" : ""}`.trim()}
              style={
                {
                  "--slot-color": slotColor(plinkoSlotHeat(slot, rows)),
                } as CSSProperties
              }
            >
              {labels[slot]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

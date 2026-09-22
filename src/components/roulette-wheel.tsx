"use client";

import { memo, useEffect, useRef, useState } from "react";
import { EUROPEAN_WHEEL_ORDER, rouletteNumberColor } from "@/lib/roulette";

const SECTOR = 360 / EUROPEAN_WHEEL_ORDER.length;
const WHEEL_ORDER: readonly number[] = EUROPEAN_WHEEL_ORDER;

export function numberTone(number: number) {
  return `tone-${rouletteNumberColor(number)}`;
}

export function colorName(number: number) {
  const color = rouletteNumberColor(number);
  return color === "green" ? "VERT" : color === "red" ? "ROUGE" : "NOIR";
}

/* ── Wheel ───────────────────────────────────────────────────────────── */

export const RouletteWheel = memo(function RouletteWheel({
  result,
  spinKey,
  spinning,
  showResult,
  poster = false,
}: {
  result: number | null;
  spinKey: number;
  spinning: boolean;
  showResult: boolean;
  poster?: boolean;
}) {
  const [rotation, setRotation] = useState(() =>
    result === null ? 0 : -WHEEL_ORDER.indexOf(result) * SECTOR,
  );
  const [ballRotation, setBallRotation] = useState(0);
  const lastKey = useRef(spinKey);

  useEffect(() => {
    if (!spinning || result === null || lastKey.current === spinKey) return;
    lastKey.current = spinKey;
    const index = WHEEL_ORDER.indexOf(result);
    // The pocket ends under the pointer whatever the previous resting angle.
    setRotation((current) => {
      const target = -index * SECTOR;
      const delta = (((target - current) % 360) + 360) % 360;
      return current + 5 * 360 + delta;
    });
    setBallRotation((current) => current - 7 * 360);
  }, [result, spinKey, spinning]);

  return (
    <div
      className={`roulette-wheel-frame ${poster ? "is-poster" : ""} ${spinning ? "is-spinning" : ""}`}
      aria-hidden="true"
    >
      <span className="roulette-wheel-pointer" />
      <div
        className="roulette-wheel"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {!poster &&
          EUROPEAN_WHEEL_ORDER.map((number, index) => (
            <span
              key={number}
              className="roulette-wheel-slot"
              style={{ transform: `rotate(${index * SECTOR}deg)` }}
            >
              <b>{number}</b>
            </span>
          ))}
        <span className="roulette-wheel-cone" />
        <span className="roulette-wheel-turret" />
      </div>
      {!poster && (
        <div
          className="roulette-ball-orbit"
          style={{ transform: `rotate(${ballRotation}deg)` }}
        >
          <span className="roulette-ball" key={spinKey} />
        </div>
      )}
      {showResult && result !== null && (
        <span
          className={`roulette-wheel-result ${numberTone(result)}`}
          key={spinKey}
        >
          {result}
        </span>
      )}
    </div>
  );
});

export function RoulettePosterArt() {
  return (
    <div className="roulette-poster-art">
      <RouletteWheel
        result={null}
        spinKey={0}
        spinning={false}
        showResult={false}
        poster
      />
      <span className="roulette-poster-ball" />
    </div>
  );
}

/* ── Layout ──────────────────────────────────────────────────────────── */

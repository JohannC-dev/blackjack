"use client";

import { useEffect, useState } from "react";

function remainingSeconds(deadline: number | null | undefined, now: number) {
  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * Keeps countdown updates local to the component that displays the clock.
 * The timeout is aligned with the next visible second instead of waking the
 * whole game table at a fixed, high frequency.
 */
export function useCountdownSeconds(deadline: number | null | undefined) {
  const [seconds, setSeconds] = useState(() =>
    remainingSeconds(deadline, Date.now()),
  );

  useEffect(() => {
    let timer: number | null = null;

    const update = () => {
      const now = Date.now();
      const next = remainingSeconds(deadline, now);
      setSeconds((current) => (current === next ? current : next));

      if (next !== null && next > 0) {
        const nextBoundary = deadline! - (next - 1) * 1000;
        timer = window.setTimeout(update, Math.max(1, nextBoundary - now));
      }
    };

    update();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [deadline]);

  return seconds;
}

export function CountdownText({
  deadline,
  suffix = "s",
  fallback = "…",
}: {
  deadline: number | null | undefined;
  suffix?: string;
  fallback?: string;
}) {
  const seconds = useCountdownSeconds(deadline);
  return <>{seconds === null ? fallback : `${seconds}${suffix}`}</>;
}

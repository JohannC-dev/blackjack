"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

const serverClockOffsetContext = createContext(0);

export function ServerClockProvider({
  offset,
  children,
}: PropsWithChildren<{ offset: number }>) {
  return (
    <serverClockOffsetContext.Provider value={offset}>
      {children}
    </serverClockOffsetContext.Provider>
  );
}

export function useServerClockNow() {
  return Date.now() + useContext(serverClockOffsetContext);
}

export function remainingSeconds(
  deadline: number | null | undefined,
  now: number,
  serverTimeOffset = 0,
) {
  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - (now + serverTimeOffset)) / 1000));
}

/**
 * Keeps countdown updates local to the component that displays the clock.
 * The timeout is aligned with the next visible second instead of waking the
 * whole game table at a fixed, high frequency.
 */
export function useCountdownSeconds(
  deadline: number | null | undefined,
  serverTimeOffset?: number,
) {
  const contextOffset = useContext(serverClockOffsetContext);
  const effectiveOffset = serverTimeOffset ?? contextOffset;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: number | null = null;

    const update = () => {
      const clientNow = Date.now();
      setNow(clientNow);
      const next = remainingSeconds(deadline, clientNow, effectiveOffset);

      if (next !== null && next > 0) {
        const nextBoundary = deadline! - (next - 1) * 1000;
        timer = window.setTimeout(
          update,
          Math.max(1, nextBoundary - (clientNow + effectiveOffset) + 1),
        );
      }
    };

    update();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [deadline, effectiveOffset]);

  return remainingSeconds(deadline, now, effectiveOffset);
}

export function CountdownText({
  deadline,
  serverTimeOffset,
  suffix = "s",
  fallback = "…",
}: {
  deadline: number | null | undefined;
  serverTimeOffset?: number;
  suffix?: string;
  fallback?: string;
}) {
  const seconds = useCountdownSeconds(deadline, serverTimeOffset);
  return <>{seconds === null ? fallback : `${seconds}${suffix}`}</>;
}

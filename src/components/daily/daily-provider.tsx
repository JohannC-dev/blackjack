"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import type { DailyStatus, DailyUpdate } from "@/lib/daily";
import type { CasinoView } from "@/lib/navigation";
import { credits } from "@/lib/rules";
import { DailyWheel } from "./daily-wheel";

type DailyContextValue = {
  status: DailyStatus | null;
  openWheel: () => void;
};

const DailyContext = createContext<DailyContextValue>({
  status: null,
  openWheel: () => {},
});

/** The player's streak, or null before the server has counted the day. */
export function useDaily() {
  return useContext(DailyContext);
}

export function days(count: number) {
  return `${count} jour${count > 1 ? "s" : ""}`;
}

function announce({ status, checkIn }: DailyUpdate) {
  if (!checkIn?.counted) return;
  if (checkIn.lost > 1)
    toast(`Votre série de ${days(checkIn.lost)} est terminée.`, {
      description: "Une nouvelle série commence aujourd’hui.",
    });
  const milestone = checkIn.milestone;
  if (!milestone) {
    toast.success(`Série : ${days(status.streak)} 🔥`);
    return;
  }
  const gains = [
    milestone.credits + milestone.converted
      ? `+${credits(milestone.credits + milestone.converted)} crédits`
      : null,
    milestone.cosmetic ? `skin « ${milestone.cosmetic.name} » débloqué` : null,
    milestone.wheelMultiplier
      ? `roue ×${milestone.wheelMultiplier.toLocaleString("fr-FR")}`
      : null,
  ].filter(Boolean);
  toast.success(`Palier ${milestone.day} atteint 🔥`, {
    description:
      gains.join(" · ") +
      (milestone.converted ? " (skin déjà possédé, converti)" : ""),
    duration: 8000,
  });
}

/**
 * Listens to the streak pushed by the server and offers the Lucky Wheel on
 * the first visit of the club day. A player at a table gets it once they
 * are back in the lobby.
 */
export function DailyProvider({
  socket,
  view,
  children,
}: {
  socket: Socket | null;
  view: CasinoView;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<DailyStatus | null>(null);
  /** The day whose wheel is on screen, kept until the player closes it. */
  const [wheelDay, setWheelDay] = useState<string | null>(null);
  /** A skipped wheel stays available from the streak panel, without reopening. */
  const [dismissedWheelDay, setDismissedWheelDay] = useState<string | null>(
    null,
  );
  const statusRef = useRef<DailyStatus | null>(null);

  const applyStatus = useCallback((next: DailyStatus) => {
    const current = statusRef.current;
    // A spin can finish just after 08:00 and deliver yesterday's snapshot.
    if (current && next.day < current.day) return false;
    statusRef.current = next;
    setStatus(next);
    return true;
  }, []);

  const openWheel = useCallback(() => {
    const current = statusRef.current;
    if (current?.spinAvailable) setWheelDay(current.day);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onStatus = (update: DailyUpdate) => {
      if (!update?.status || !applyStatus(update.status)) return;
      announce(update);
    };
    socket.on("daily:status", onStatus);
    return () => {
      socket.off("daily:status", onStatus);
    };
  }, [applyStatus, socket]);

  // Open on the first lobby visit, but keep a skipped popup dismissed today.
  if (
    status?.spinAvailable &&
    view === "home" &&
    wheelDay === null &&
    dismissedWheelDay !== status.day
  )
    setWheelDay(status.day);

  return (
    <DailyContext.Provider value={{ status, openWheel }}>
      {children}
      {socket && status && wheelDay !== null && (
        <DailyWheel
          socket={socket}
          multiplier={status.wheelMultiplier}
          onSpun={applyStatus}
          onClose={() => {
            setDismissedWheelDay(wheelDay);
            setWheelDay(null);
          }}
        />
      )}
    </DailyContext.Provider>
  );
}

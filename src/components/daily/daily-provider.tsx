"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import type { DailyStatus, DailyUpdate } from "@/lib/daily";
import type { CasinoView } from "@/lib/navigation";
import { credits } from "@/lib/rules";
import { DailyWheel } from "./daily-wheel";

const DailyContext = createContext<DailyStatus | null>(null);

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

  useEffect(() => {
    if (!socket) return;
    const onStatus = (update: DailyUpdate) => {
      if (!update?.status) return;
      setStatus(update.status);
      announce(update);
    };
    socket.on("daily:status", onStatus);
    return () => {
      socket.off("daily:status", onStatus);
    };
  }, [socket]);

  // Opened while rendering: the wheel shows up with the lobby, no flash.
  if (status?.spinAvailable && view === "home" && wheelDay !== status.day)
    setWheelDay(status.day);

  return (
    <DailyContext.Provider value={status}>
      {children}
      {socket && status && wheelDay === status.day && (
        <DailyWheel
          socket={socket}
          multiplier={status.wheelMultiplier}
          onSpun={setStatus}
          onClose={() => {
            // Closing is only offered once the day's spin is used up.
            setStatus((current) =>
              current ? { ...current, spinAvailable: false } : current,
            );
            setWheelDay(null);
          }}
        />
      )}
    </DailyContext.Provider>
  );
}

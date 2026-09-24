"use client";

import { Gift, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import {
  WHEEL_SEGMENTS,
  WHEEL_SPIN_MS,
  type DailySpin,
  type DailyStatus,
} from "@/lib/daily";
import { credits } from "@/lib/rules";
import { Modal } from "../ui/modal";
import { motionDuration } from "../ui/motion";

const SLICE = 360 / WHEEL_SEGMENTS.length;

function shortCredits(amount: number) {
  if (amount >= 1_000_000)
    return `${(amount / 1_000_000).toLocaleString("fr-FR")} M`;
  return `${(amount / 1_000).toLocaleString("fr-FR")} k`;
}

type Phase =
  | { kind: "ready" }
  | { kind: "waiting" }
  | { kind: "spinning"; spin: DailySpin }
  | { kind: "done"; spin: DailySpin }
  | { kind: "failed"; error: string; retry: boolean };

/**
 * The free spin of the club day. It cannot be dismissed before it turned:
 * the server has drawn the prize, the wheel only lands on it.
 */
export function DailyWheel({
  socket,
  multiplier,
  onSpun,
  onClose,
}: {
  socket: Socket;
  multiplier: number;
  onSpun: (status: DailyStatus) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const [rotation, setRotation] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const spin = () => {
    setPhase({ kind: "waiting" });
    socket
      .timeout(8000)
      .emit(
        "daily:spin",
        (
          timeout: Error | null,
          ack: { ok: true; spin: DailySpin } | { ok: false; error: string },
        ) => {
          if (timeout || !ack?.ok) {
            setPhase({
              kind: "failed",
              error: timeout
                ? "La roue ne répond pas."
                : (ack as { error: string }).error,
              retry: !!timeout,
            });
            return;
          }
          const { spin } = ack;
          onSpun(spin.status);
          // Six turns, then the drawn slice stops under the pointer.
          setRotation(6 * 360 - (spin.segment + 0.5) * SLICE);
          setPhase({ kind: "spinning", spin });
          timer.current = window.setTimeout(
            () => {
              timer.current = null;
              setPhase({ kind: "done", spin });
              toast.success(`Roue : +${credits(spin.amount)} crédits`);
            },
            motionDuration(WHEEL_SPIN_MS, 300),
          );
        },
      );
  };

  const closable =
    phase.kind === "done" || (phase.kind === "failed" && !phase.retry);
  const boosted = multiplier > 1;

  return (
    <Modal
      title="Roue de la fortune"
      className="daily-wheel-modal"
      onClose={closable ? onClose : undefined}
    >
      <span className="section-kicker">
        CADEAU DU JOUR
        {boosted && ` · ROUE ×${multiplier.toLocaleString("fr-FR")}`}
      </span>
      <h2>Roue de la fortune</h2>
      <div className="daily-wheel-stage">
        <span className="daily-wheel-pointer" aria-hidden="true" />
        <div
          className="daily-wheel"
          style={{
            transform: `rotate(${rotation}deg)`,
            transitionDuration: `${motionDuration(WHEEL_SPIN_MS, 300)}ms`,
          }}
          aria-hidden="true"
        >
          {WHEEL_SEGMENTS.map((segment, index) => (
            <span
              key={index}
              style={{
                transform: `rotate(${(index + 0.5) * SLICE}deg) translateY(-76px)`,
              }}
            >
              {shortCredits(Math.round(segment.amount * multiplier))}
            </span>
          ))}
        </div>
      </div>
      <p className="modal-intro daily-wheel-result" role="status">
        {phase.kind === "done"
          ? `+${credits(phase.spin.amount)} crédits`
          : phase.kind === "failed"
            ? phase.error
            : phase.kind === "spinning"
              ? "La roue tourne…"
              : "Un tour gratuit par jour, jusqu’à 8 h demain."}
      </p>
      {phase.kind === "done" || (phase.kind === "failed" && !phase.retry) ? (
        <button type="button" className="button primary" onClick={onClose}>
          {phase.kind === "done" ? "Récupérer" : "Fermer"}
        </button>
      ) : (
        <button
          type="button"
          className="button primary"
          autoFocus
          disabled={phase.kind === "waiting" || phase.kind === "spinning"}
          onClick={spin}
        >
          {phase.kind === "waiting" ? (
            <LoaderCircle size={16} className="spinner" />
          ) : (
            <Gift size={16} />
          )}
          {phase.kind === "failed" ? "Réessayer" : "Tourner la roue"}
        </button>
      )}
    </Modal>
  );
}

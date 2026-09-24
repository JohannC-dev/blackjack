"use client";

import { Gift, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import {
  WHEEL_SEGMENTS,
  WHEEL_SPIN_MS,
  type DailySpin,
  type DailyStatus,
} from "@/lib/daily";
import { credits } from "@/lib/rules";
import { Chip } from "../ui/chip";
import { Modal } from "../ui/modal";
import { motionDuration } from "../ui/motion";

const SLICE = 360 / WHEEL_SEGMENTS.length;
const WHEEL_COLORS = [
  "#44334f",
  "#55364a",
  "#3d3855",
  "#5a3c43",
  "#48324f",
  "#583746",
  "#403953",
  "#604a35",
];
const wheelPrizeGradient = `conic-gradient(${WHEEL_SEGMENTS.map(
  (_, index) =>
    `${WHEEL_COLORS[index % WHEEL_COLORS.length]} ${index * SLICE}deg ${(index + 1) * SLICE}deg`,
).join(", ")})`;
const wheelBackground = `radial-gradient(circle at 50% 32%, rgba(255, 255, 255, .12), transparent 58%), ${wheelPrizeGradient}`;
const wheelDividers = WHEEL_SEGMENTS.map((_, index) => {
  const angle = ((index * SLICE - 90) * Math.PI) / 180;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return {
    x1: 50 + x * 11,
    y1: 50 + y * 11,
    x2: 50 + x * 44,
    y2: 50 + y * 44,
  };
});

type Phase =
  | { kind: "ready" }
  | { kind: "waiting" }
  | { kind: "spinning"; spin: DailySpin }
  | { kind: "done"; spin: DailySpin }
  | { kind: "failed"; error: string };

/** The daily spin can be postponed; once started, the server picks its prize. */
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

  const finishSpin = (spin: DailySpin) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPhase({ kind: "done", spin });
    toast.success(`Roue : +${credits(spin.amount)} crédits`);
  };

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
                : ack && !ack.ok
                  ? ack.error
                  : "La roue est temporairement indisponible.",
            });
            return;
          }
          const { spin } = ack;
          onSpun(spin.status);
          // Spin counter-clockwise, then land the drawn slice under the pointer.
          setRotation(-(6 * 360 + (spin.segment + 0.5) * SLICE));
          setPhase({ kind: "spinning", spin });
          timer.current = window.setTimeout(
            () => {
              finishSpin(spin);
            },
            motionDuration(WHEEL_SPIN_MS, 300),
          );
        },
      );
  };

  const closable =
    phase.kind === "ready" || phase.kind === "done" || phase.kind === "failed";
  const boosted = multiplier > 1;

  return (
    <Modal
      title="Roue de la fortune"
      className="daily-wheel-modal"
      showCloseButton={false}
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
            backgroundImage: wheelBackground,
          }}
          aria-hidden="true"
        >
          <svg
            className="daily-wheel-dividers"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            {wheelDividers.map((line, index) => (
              <line
                key={index}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
              />
            ))}
          </svg>
          {WHEEL_SEGMENTS.map((segment, index) => (
            <span
              key={index}
              className="daily-wheel-prize"
              style={
                {
                  "--angle": `${(index + 0.5) * SLICE}deg`,
                } as CSSProperties
              }
            >
              <Chip
                amount={Math.round(segment.amount * multiplier)}
                displayOnly
                className="daily-wheel-token"
              />
            </span>
          ))}
          <div className="daily-wheel-hub" />
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
      {phase.kind === "done" ? (
        <button type="button" className="button primary" onClick={onClose}>
          Récupérer
        </button>
      ) : phase.kind === "waiting" ? (
        <button type="button" className="button primary" disabled>
          <LoaderCircle size={16} className="spinner" />
          Préparation…
        </button>
      ) : phase.kind === "spinning" ? (
        <div className="daily-wheel-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => finishSpin(phase.spin)}
          >
            Passer l’animation
          </button>
          <button type="button" className="button primary" disabled>
            <Gift size={16} />
            La roue tourne…
          </button>
        </div>
      ) : (
        <div className="daily-wheel-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Plus tard
          </button>
          <button
            type="button"
            className="button primary"
            autoFocus
            onClick={spin}
          >
            <Gift size={16} />
            {phase.kind === "failed" ? "Réessayer" : "Tourner la roue"}
          </button>
        </div>
      )}
    </Modal>
  );
}

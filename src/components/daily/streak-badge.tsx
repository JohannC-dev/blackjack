"use client";

import { Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { upcomingMilestones, type StreakMilestone } from "@/lib/daily";
import { credits } from "@/lib/rules";
import { Modal } from "../ui/modal";
import { days, useDaily } from "./daily-provider";

function untilReset(deadline: number, now: number) {
  const minutes = Math.max(1, Math.ceil((deadline - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours} h ${String(minutes % 60).padStart(2, "0")}`
    : `${minutes} min`;
}

function milestoneLabel(milestone: StreakMilestone) {
  const parts = [
    milestone.credits ? `${credits(milestone.credits)} crédits` : null,
    milestone.cosmeticId ? "un skin exclusif" : null,
    milestone.wheelMultiplier
      ? `roue ×${milestone.wheelMultiplier.toLocaleString("fr-FR")}`
      : null,
  ].filter(Boolean);
  return parts.join(" + ");
}

/** The flame next to the balance, opening the streak panel. */
export function StreakBadge() {
  const { status, openWheel } = useDaily();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [open]);
  if (!status) return null;

  const decade = status.streak % 10;
  // A streak ending on a milestone shows the full bar it just completed.
  const filled = status.streak && !decade ? 10 : decade;
  const target = Math.floor((status.streak - filled) / 10) * 10 + 10;

  return (
    <>
      <button
        type="button"
        className="streak-badge"
        data-active={status.streak > 0}
        title={`Série de ${days(status.streak)}`}
        aria-label={`Série de connexion : ${days(status.streak)}`}
        onClick={() => setOpen(true)}
      >
        <Flame size={16} />
        <b>{status.streak}</b>
      </button>
      {open && (
        <Modal
          title="Série de connexion"
          className="streak-panel"
          onClose={() => setOpen(false)}
        >
          <span className="modal-emblem">
            <Flame size={26} />
          </span>
          <span className="section-kicker">SÉRIE DE CONNEXION</span>
          <h2>{days(status.streak)} d’affilée</h2>
          <p className="modal-intro">
            Connectez-vous chaque jour avant 8 h le lendemain pour garder votre
            série. Record : {days(status.best)}.
          </p>
          <ol className="streak-track" aria-label={`Vers le palier ${target}`}>
            {Array.from({ length: 10 }, (_, index) => (
              <li
                key={index}
                data-done={index < filled}
                data-milestone={index === 9}
              >
                {target - 9 + index}
              </li>
            ))}
          </ol>
          <ul className="streak-milestones">
            {upcomingMilestones(status.streak).map((milestone) => (
              <li key={milestone.day}>
                <b>Jour {milestone.day}</b>
                <span>{milestoneLabel(milestone)}</span>
              </li>
            ))}
          </ul>
          <p className="streak-reset">
            {status.spinAvailable
              ? "Votre tour gratuit est prêt. Vous pouvez le lancer quand vous voulez."
              : `Prochaine roue dans ${untilReset(status.nextResetAt, now)}.`}
            {status.wheelMultiplier > 1 &&
              ` Roue actuelle : ×${status.wheelMultiplier.toLocaleString("fr-FR")}.`}
          </p>
          {status.spinAvailable && (
            <button
              type="button"
              className="button primary streak-wheel-open"
              onClick={() => {
                setOpen(false);
                openWheel();
              }}
            >
              Ouvrir la roue
            </button>
          )}
        </Modal>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Smile } from "lucide-react";
import {
  EMOTES,
  EMOTE_BY_ID,
  type EmoteDefinition,
  type EmoteGame,
  type EmoteRequest,
  type ReceivedEmote,
} from "@/lib/emotes";
import styles from "./emotes.module.css";

const MUTE_KEY = "minuit.emotes.muted";
const MUTE_EVENT = "minuit:emotes-muted";
/** Older emotes (received while another game was open) are skipped. */
const STALE_MS = 4_000;
const COOLDOWN_MS = 750;
const THROWS = EMOTES.filter((emote) => emote.kind === "throw");
const REACTIONS = EMOTES.filter((emote) => emote.kind === "reaction");

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Per-viewer preference: hides the emotes of the other players. */
function useEmotesMuted() {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(readMuted());
    const sync = () => setMuted(readMuted());
    window.addEventListener(MUTE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MUTE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(MUTE_KEY, readMuted() ? "0" : "1");
    } catch {
      /* Without storage the preference only lasts for this page. */
    }
    setMuted((value) => !value);
    window.dispatchEvent(new Event(MUTE_EVENT));
  }, []);
  return [muted, toggle] as const;
}

export type EmotePlayer = { id: string; name: string };

export function EmoteButton({
  game,
  players,
  playerId,
  seated,
  onSend,
}: {
  game: EmoteGame;
  /** Players seated at the table, the viewer included. */
  players: EmotePlayer[];
  playerId: string;
  /** Only seated players can send emotes. */
  seated: boolean;
  onSend: (request: EmoteRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [coolingDown, setCoolingDown] = useState(false);
  const [muted, toggleMuted] = useEmotesMuted();
  const rootRef = useRef<HTMLDivElement>(null);
  const others = players.filter((player) => player.id !== playerId);
  const target = others.find((player) => player.id === targetId) ?? others[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const send = (emote: EmoteDefinition) => {
    if (coolingDown || !seated) return;
    if (emote.kind === "throw" && !target) return;
    onSend({
      game,
      emote: emote.id,
      targetId: emote.kind === "throw" ? target!.id : undefined,
    });
    setCoolingDown(true);
    window.setTimeout(() => setCoolingDown(false), COOLDOWN_MS);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`poker-sound ${open ? "active" : ""}`}
        aria-label="Émotes"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Émotes"
        onClick={() => setOpen(!open)}
      >
        <Smile size={15} />
      </button>
      {open && (
        <div className={styles.picker} role="dialog" aria-label="Émotes">
          {!seated && (
            <p className={styles.hint}>
              Prenez place à la table pour envoyer des émotes.
            </p>
          )}
          <div className={styles.section}>
            <span className={styles.title}>Lancer sur</span>
            {others.length ? (
              <div className={styles.targets}>
                {others.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={`${styles.target} ${player.id === target?.id ? styles.selected : ""}`}
                    aria-pressed={player.id === target?.id}
                    onClick={() => setTargetId(player.id)}
                  >
                    <span className="avatar tiny">
                      {player.name.slice(0, 1).toUpperCase()}
                    </span>
                    {player.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles.hint}>Personne à viser pour l’instant.</p>
            )}
            <div className={styles.grid}>
              {THROWS.map((emote) => (
                <button
                  key={emote.id}
                  type="button"
                  className={styles.emote}
                  disabled={!seated || !target || coolingDown}
                  aria-label={
                    target ? `${emote.label} sur ${target.name}` : emote.label
                  }
                  title={
                    target ? `${emote.label} sur ${target.name}` : emote.label
                  }
                  onClick={() => send(emote)}
                >
                  <span className={styles.glyph}>{emote.glyph}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <span className={styles.title}>Réactions</span>
            <div className={styles.grid}>
              {REACTIONS.map((emote) => (
                <button
                  key={emote.id}
                  type="button"
                  className={styles.emote}
                  disabled={!seated || coolingDown}
                  aria-label={emote.label}
                  title={emote.label}
                  onClick={() => send(emote)}
                >
                  <span className={styles.glyph}>{emote.glyph}</span>
                </button>
              ))}
            </div>
          </div>
          <label className={styles.mute}>
            <input type="checkbox" checked={muted} onChange={toggleMuted} />
            Masquer les émotes des autres
          </label>
        </div>
      )}
    </div>
  );
}

type Point = { x: number; y: number };

function anchorOf(playerId: string | undefined) {
  if (!playerId) return null;
  return document.querySelector<HTMLElement>(
    `[data-emote-player="${CSS.escape(playerId)}"]`,
  );
}

function centerOf(element: HTMLElement): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function spawn(layer: HTMLElement, className: string, text: string, at: Point) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  element.style.left = `${at.x}px`;
  element.style.top = `${at.y}px`;
  layer.appendChild(element);
  return element;
}

function burst(layer: HTMLElement, at: Point, colors: string[], count = 14) {
  const animations: Promise<unknown>[] = [];
  for (let index = 0; index < count; index++) {
    const particle = spawn(layer, styles.particle, "", at);
    particle.style.background = colors[index % colors.length];
    const angle = (index / count) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 28 + Math.random() * 38;
    const size = 0.6 + Math.random() * 0.9;
    const animation = particle.animate(
      [
        { transform: `translate(-50%, -50%) scale(${size})`, opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance + 18}px)) scale(0.2)`,
          opacity: 0,
        },
      ],
      {
        duration: 620 + Math.random() * 240,
        easing: "cubic-bezier(.2,.7,.3,1)",
      },
    );
    animations.push(animation.finished.finally(() => particle.remove()));
  }
  return Promise.all(animations);
}

async function playThrow(
  layer: HTMLElement,
  emote: EmoteDefinition,
  event: ReceivedEmote,
  reduced: boolean,
) {
  const targetAnchor = anchorOf(event.targetId);
  if (!targetAnchor) return;
  const end = centerOf(targetAnchor);
  const fromAnchor = anchorOf(event.fromId);
  const start = fromAnchor
    ? centerOf(fromAnchor)
    : { x: window.innerWidth / 2, y: window.innerHeight - 40 };
  if (!reduced) {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const lift = Math.min(240, 60 + distance * 0.4);
    const control = {
      x: (start.x + end.x) / 2,
      y: Math.min(start.y, end.y) - lift,
    };
    const spin = (end.x >= start.x ? 1 : -1) * 540;
    const steps = 14;
    const keyframes: Keyframe[] = [];
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x =
        (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x;
      const y =
        (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y;
      const scale = 0.75 + Math.sin(t * Math.PI) * 0.55;
      keyframes.push({
        transform: `translate(${x - start.x}px, ${y - start.y}px) translate(-50%, -50%) rotate(${spin * t}deg) scale(${scale})`,
      });
    }
    const projectile = spawn(layer, styles.projectile, emote.glyph, start);
    await projectile
      .animate(keyframes, {
        duration: 560 + Math.min(360, distance * 0.5),
        easing: "cubic-bezier(.35,.1,.6,1)",
      })
      .finished.finally(() => projectile.remove());
  }
  // Impact: the projectile squashes on the target, which flinches.
  targetAnchor.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px) rotate(-3deg)" },
      { transform: "translateX(5px) rotate(2deg)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 420, easing: "ease-out" },
  );
  const splat = spawn(layer, styles.splat, emote.glyph, end);
  const stain = spawn(layer, styles.stain, emote.impact ?? emote.glyph, {
    x: end.x + 18,
    y: end.y - 22,
  });
  await Promise.all([
    splat
      .animate(
        [
          { transform: "translate(-50%, -50%) scale(1.1, 1.1)", opacity: 1 },
          { transform: "translate(-50%, -50%) scale(1.9, 0.7)", opacity: 0.95 },
          { transform: "translate(-50%, -40%) scale(2.1, 0.5)", opacity: 0 },
        ],
        { duration: 520, easing: "ease-out" },
      )
      .finished.finally(() => splat.remove()),
    stain
      .animate(
        [
          { transform: "translate(-50%, -50%) scale(0)", opacity: 0 },
          {
            transform: "translate(-50%, -50%) scale(1.35)",
            opacity: 1,
            offset: 0.15,
          },
          {
            transform: "translate(-50%, -50%) scale(1)",
            opacity: 1,
            offset: 0.3,
          },
          {
            transform: "translate(-50%, -70%) scale(1)",
            opacity: 1,
            offset: 0.8,
          },
          { transform: "translate(-50%, -90%) scale(0.9)", opacity: 0 },
        ],
        { duration: 1_600, easing: "ease-out" },
      )
      .finished.finally(() => stain.remove()),
    reduced ? Promise.resolve() : burst(layer, end, emote.colors ?? ["#fff"]),
  ]);
}

async function playReaction(
  layer: HTMLElement,
  emote: EmoteDefinition,
  event: ReceivedEmote,
  reduced: boolean,
) {
  const anchor = anchorOf(event.fromId);
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const at = { x: rect.left + rect.width / 2, y: rect.top - 8 };
  const bubble = document.createElement("span");
  bubble.className = styles.reaction;
  bubble.style.left = `${at.x}px`;
  bubble.style.top = `${at.y}px`;
  const glyph = document.createElement("b");
  glyph.textContent = emote.glyph;
  bubble.append(glyph);
  layer.appendChild(bubble);
  const wiggle = emote.id === "fuck" || emote.id === "rage";
  const frames: Keyframe[] = reduced
    ? [
        { opacity: 0, transform: "translate(-50%, -100%)" },
        { opacity: 1, transform: "translate(-50%, -100%)", offset: 0.1 },
        { opacity: 1, transform: "translate(-50%, -100%)", offset: 0.85 },
        { opacity: 0, transform: "translate(-50%, -100%)" },
      ]
    : [
        { opacity: 0, transform: "translate(-50%, -80%) scale(0.2)" },
        {
          opacity: 1,
          transform: "translate(-50%, -100%) scale(1.25)",
          offset: 0.1,
        },
        {
          opacity: 1,
          transform: `translate(-50%, -100%) scale(1) rotate(${wiggle ? -12 : -4}deg)`,
          offset: 0.2,
        },
        {
          opacity: 1,
          transform: `translate(-50%, -106%) scale(1) rotate(${wiggle ? 12 : 4}deg)`,
          offset: 0.35,
        },
        {
          opacity: 1,
          transform: `translate(-50%, -100%) scale(1) rotate(${wiggle ? -10 : -3}deg)`,
          offset: 0.5,
        },
        {
          opacity: 1,
          transform: "translate(-50%, -106%) scale(1) rotate(0deg)",
          offset: 0.8,
        },
        { opacity: 0, transform: "translate(-50%, -150%) scale(0.9)" },
      ];
  await bubble
    .animate(frames, { duration: 2_200, easing: "ease-out" })
    .finished.finally(() => bubble.remove());
}

/**
 * Animates the emotes of one game over the whole viewport. The layer is
 * portalled into the fullscreen element when there is one, otherwise the
 * fullscreen table would hide it.
 */
export function EmoteLayer({
  game,
  events,
  playerId,
  onDone,
}: {
  game: EmoteGame;
  events: ReceivedEmote[];
  playerId: string;
  onDone: (id: string) => void;
}) {
  const [host, setHost] = useState<Element | null>(null);
  const [muted] = useEmotesMuted();
  const layerRef = useRef<HTMLDivElement>(null);
  const started = useRef(new Set<string>());

  useEffect(() => {
    const sync = () => setHost(document.fullscreenElement ?? document.body);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    for (const event of events) {
      if (started.current.has(event.id)) continue;
      started.current.add(event.id);
      const emote = EMOTE_BY_ID.get(event.emote);
      const involvesMe =
        event.fromId === playerId || event.targetId === playerId;
      if (
        !emote ||
        event.game !== game ||
        Date.now() - event.receivedAt > STALE_MS ||
        (muted && !involvesMe)
      ) {
        onDone(event.id);
        continue;
      }
      const play = emote.kind === "throw" ? playThrow : playReaction;
      play(layer, emote, event, reduced)
        .catch(() => {})
        .finally(() => onDone(event.id));
    }
  }, [events, game, muted, playerId, onDone, host]);

  useEffect(() => {
    const ids = new Set(events.map((event) => event.id));
    for (const id of started.current)
      if (!ids.has(id)) started.current.delete(id);
  }, [events]);

  if (!host) return null;
  return createPortal(
    <div className={styles.layer} ref={layerRef} aria-hidden="true" />,
    host,
  );
}

"use client";

import { CircleDot, Minus, Plus, Repeat2, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameAudio } from "@/lib/audio-context";
import type { CasinoView } from "@/lib/navigation";
import {
  plinkoMultiplierLabel,
  plinkoMultipliers,
  plinkoSlotHeat,
  PLINKO_MAX_BALLS,
  PLINKO_MAX_BET,
  PLINKO_MIN_BET,
  PLINKO_RISKS,
  PLINKO_RISK_LABELS,
  PLINKO_ROW_OPTIONS,
  type PlinkoRisk,
  type PlinkoRows,
} from "@/lib/plinko";
import {
  playPlinkoLanding,
  playPlinkoPeg,
  playPlinkoRelease,
} from "@/lib/plinko-audio";
import { credits } from "@/lib/rules";
import type { PlinkoDrop } from "@/lib/types";
import { useGame } from "@/lib/use-game";
import { CasinoRail, ClubHeader, getClubBalance } from "../../ui";
import {
  BetChipPicker,
  GameActionButton,
  GameControlGroup,
  GameControlsBar,
  GameOption,
  GamePopoverControl,
  GameStepSlider,
} from "../../ui/game-controls";
import { PlinkoBoard, type PlinkoBoardHandle } from "./plinko-board";

type Game = ReturnType<typeof useGame>;

/** Delay between two balls of a same batch, so they read as a stream. */
const BALL_STAGGER_MS = 115;
/** Pause between two salvos of the auto mode, so they read as waves. */
const WAVE_GAP_MS = 220;
/** Landings kept in the strip beside the board. */
const HISTORY_SIZE = 6;
const AUTO_DEFAULT = 10;
const AUTO_MAX = 100;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function PlinkoCasino({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: (view: CasinoView) => void;
}) {
  const state = game.plinkoState;
  const [risk, setRisk] = useState<PlinkoRisk>("medium");
  const [rows, setRows] = useState<PlinkoRows>(16);
  const [bet, setBet] = useState<number>(PLINKO_MIN_BET);
  const [autoCount, setAutoCount] = useState<number>(AUTO_DEFAULT);
  const [auto, setAuto] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  /** Winnings of the balls still falling, held back from the wallet on screen. */
  const [inFlight, setInFlight] = useState(0);
  const [highlight, setHighlight] = useState<{
    slot: number;
    key: number;
  } | null>(null);
  const [history, setHistory] = useState<PlinkoDrop[]>([]);
  const [message, setMessage] = useState("");
  const { enabled: sound, contextRef: audioRef } = useGameAudio();

  const board = useRef<PlinkoBoardHandle>(null);
  const seen = useRef(new Set<string>());
  /** Drops already on the board when the view opened are not replayed. */
  const seeded = useRef(false);
  const autoRun = useRef({ id: 0, running: false });
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const flashKey = useRef(0);
  /**
   * When the next ball may leave the top of the board. Balls queue behind it,
   * so a salvo that arrives early waits for the previous one instead of
   * falling on top of it.
   */
  const releaseAt = useRef(0);

  // The wager leaves the wallet at once, the winnings only when the ball lands.
  const settledBalance = Math.max(0, getClubBalance(game) - inFlight);
  const maxBet = Math.min(PLINKO_MAX_BET, Math.floor(settledBalance));
  const multipliers = useMemo(
    () => plinkoMultipliers(risk, rows),
    [risk, rows],
  );

  const play = useCallback((effect: (context: AudioContext) => void) => {
    if (soundRef.current && audioRef.current) effect(audioRef.current);
  }, []);

  const onLand = useCallback(
    (drop: PlinkoDrop) => {
      flashKey.current += 1;
      setHighlight({ slot: drop.slot, key: flashKey.current });
      setHistory((current) => [drop, ...current].slice(0, HISTORY_SIZE));
      setInFlight((current) => Math.max(0, current - drop.payout));
      // A series or a salvo is a crowd: only its notable landings are heard.
      const crowded = autoRef.current || (board.current?.falling() ?? 0) > 0;
      play((context) => playPlinkoLanding(context, drop.multiplier, crowded));
    },
    [play],
  );

  const onPeg = useCallback(
    (row: number, rows: number, live: number) =>
      play((context) => playPlinkoPeg(context, row, rows, live)),
    [play],
  );

  /** Every drop the server settles is replayed once, then forgotten. */
  useEffect(() => {
    // The first snapshot is the board as it already stands, null included:
    // seeding on it is what keeps a reconnection from replaying old drops.
    if (!seeded.current) {
      seeded.current = true;
      seen.current = new Set(state?.drops.map((drop) => drop.id) ?? []);
      return;
    }
    if (!state) return;
    const fresh = state.drops.filter((drop) => !seen.current.has(drop.id));
    if (!fresh.length) return;
    for (const drop of fresh) seen.current.add(drop.id);
    if (seen.current.size > 200)
      seen.current = new Set(state.drops.map((drop) => drop.id));
    setInFlight((current) =>
      fresh.reduce((total, drop) => total + drop.payout, current),
    );
    const now = performance.now();
    const first = Math.max(now, releaseAt.current);
    fresh.forEach((drop, index) =>
      board.current?.drop(drop, first - now + index * BALL_STAGGER_MS),
    );
    releaseAt.current =
      first +
      fresh.length * BALL_STAGGER_MS +
      (fresh.length > 1 ? WAVE_GAP_MS : 0);
    window.setTimeout(() => {
      if (soundRef.current && audioRef.current)
        playPlinkoRelease(audioRef.current);
    }, first - now);
  }, [state]);

  const stopAuto = useCallback(() => {
    autoRun.current.id += 1;
    autoRun.current.running = false;
    setAuto(false);
    setAutoLeft(0);
  }, []);

  const dropBalls = useCallback(
    (balls: number) =>
      game.plinkoCommand({ type: "drop", bet, risk, rows, balls }),
    [bet, game, risk, rows],
  );

  const insufficient = bet > settledBalance;

  const dropOne = useCallback(() => {
    if (auto || bet > settledBalance) return;
    setMessage("");
    void dropBalls(1);
  }, [auto, bet, dropBalls, settledBalance]);

  const startAuto = useCallback(async () => {
    if (autoRun.current.running) {
      stopAuto();
      return;
    }
    const runId = ++autoRun.current.id;
    autoRun.current.running = true;
    setAuto(true);
    setMessage("");
    let left = autoCount;
    setAutoLeft(left);
    while (left > 0 && autoRun.current.id === runId) {
      const balls = Math.min(PLINKO_MAX_BALLS, left);
      const sentAt = performance.now();
      const ok = await dropBalls(balls);
      if (!ok || autoRun.current.id !== runId) break;
      left -= balls;
      setAutoLeft(left);
      // The next salvo is ordered ahead of time: the server takes about as
      // long to answer as the last one did, and its balls should reach the
      // board just as the queue runs dry, not after an empty pause.
      const latency = performance.now() - sentAt;
      if (left > 0)
        await wait(
          Math.max(0, releaseAt.current - performance.now() - latency),
        );
    }
    if (autoRun.current.id !== runId) return;
    autoRun.current.running = false;
    setAuto(false);
    setAutoLeft(0);
    const dropped = autoCount - left;
    setMessage(
      left > 0
        ? `Série interrompue · ${dropped} bille${dropped === 1 ? "" : "s"} sur ${autoCount}.`
        : `Série terminée · ${autoCount} billes lâchées.`,
    );
  }, [autoCount, dropBalls, stopAuto]);

  useEffect(() => () => void (autoRun.current.id += 1), []);

  /** A board that changes shape mid-series would mislabel the landings. */
  const locked = auto;
  const changeAutoCount = (delta: number) =>
    setAutoCount((current) => Math.min(AUTO_MAX, Math.max(1, current + delta)));

  return (
    <div className="casino-shell plinko-shell">
      <CasinoRail active="plinko" onNavigate={onNavigate} />
      <div className="ml-[76px] max-[700px]:ml-[55px] max-[450px]:ml-0">
        <ClubHeader
          balance={settledBalance}
          name={game.profile?.name ?? ""}
          onSignOut={game.signOut}
        />
        <main className="plinko-page">
          <header className="plinko-page-heading">
            <div className="plinko-title-block">
              <span className="eyebrow">
                LE CLUB <span>/</span> JEU SOLO
              </span>
              <h1>
                Le <em>Plinko</em>
              </h1>
            </div>
          </header>

          <div className="plinko-game-layout">
            <section className="plinko-board-stage" aria-label="Planche Plinko">
              <PlinkoBoard
                rows={rows}
                risk={risk}
                multipliers={multipliers}
                highlight={highlight}
                handle={board}
                onLand={onLand}
                onPeg={onPeg}
              />
              <ul className="plinko-history" aria-label="Dernières billes">
                {history.map((drop) => (
                  <li
                    key={drop.id}
                    data-heat={plinkoSlotHeat(drop.slot, drop.rows).toFixed(1)}
                    className={drop.net >= 0 ? "is-up" : "is-down"}
                  >
                    {plinkoMultiplierLabel(drop.multiplier)}
                  </li>
                ))}
              </ul>
            </section>

            <GameControlsBar ariaLabel="Réglages du Plinko">
              <GameControlGroup label="Risque" className="plinko-risk-control">
                <div className="game-options" role="radiogroup">
                  {PLINKO_RISKS.map((option) => (
                    <GameOption
                      key={option}
                      compact
                      selected={risk === option}
                      disabled={locked}
                      onClick={() => setRisk(option)}
                    >
                      {PLINKO_RISK_LABELS[option]}
                    </GameOption>
                  ))}
                </div>
              </GameControlGroup>

              <GameControlGroup
                label={
                  <>
                    Rangées<span className="game-bet-amount">{rows}</span>
                  </>
                }
                className="plinko-rows-control"
              >
                <GameStepSlider
                  values={PLINKO_ROW_OPTIONS}
                  value={rows}
                  disabled={locked}
                  ariaLabel="Nombre de rangées"
                  summary={`${rows} rangées`}
                  format={(value) => String(value)}
                  hints={["cases larges", "gains extrêmes"]}
                  onChange={(value) => setRows(value as PlinkoRows)}
                />
              </GameControlGroup>

              <GameControlGroup label="Jetons" className="plinko-bet-control">
                <BetChipPicker
                  bet={bet}
                  maxBet={maxBet}
                  balance={settledBalance}
                  disabled={locked}
                  onSelect={setBet}
                />
              </GameControlGroup>

              <GameActionButton
                variant="start"
                busy={game.pending && !auto}
                disabled={!game.connected || auto || insufficient}
                icon={<CircleDot size={18} />}
                label="Lâcher une bille"
                subline={`${credits(bet)} cr.`}
                onClick={dropOne}
              />

              <GamePopoverControl
                id="plinko-auto-popover"
                panelLabel="Configurer la série automatique"
                running={auto}
                icon={
                  auto ? (
                    <Square size={14} fill="currentColor" />
                  ) : (
                    <Repeat2 size={15} />
                  )
                }
                title="Série"
                status={
                  auto
                    ? `${autoLeft} à lâcher`
                    : `${autoCount} bille${autoCount === 1 ? "" : "s"}`
                }
                badge={`×${autoCount}`}
              >
                {(close) => (
                  <>
                    <div className="mines-pattern-popover-heading">
                      <div>
                        <span className="mines-pattern-kicker">
                          MODE AUTOMATIQUE
                        </span>
                        <strong>
                          {auto ? "Série en cours" : "Lâcher plusieurs billes"}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="mines-pattern-close"
                        aria-label="Fermer le panneau série"
                        onClick={close}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <p className="mines-pattern-intro">
                      Les billes partent par salves de {PLINKO_MAX_BALLS}, à la
                      mise et au risque choisis. Chaque bille est réglée
                      séparément par le serveur.
                    </p>
                    <div className="mines-pattern-settings">
                      <div className="mines-pattern-setting">
                        <span>Nombre de billes</span>
                        <div className="mines-pattern-stepper">
                          <button
                            type="button"
                            aria-label="Diminuer le nombre de billes"
                            disabled={auto || autoCount <= 1}
                            onClick={() => changeAutoCount(-1)}
                          >
                            <Minus size={13} />
                          </button>
                          <label>
                            <span aria-hidden="true">×</span>
                            <input
                              type="number"
                              min="1"
                              max={AUTO_MAX}
                              step="1"
                              value={autoCount}
                              disabled={auto}
                              aria-label="Nombre de billes de la série"
                              onChange={(event) => {
                                const value = Number(event.currentTarget.value);
                                setAutoCount(
                                  Number.isFinite(value)
                                    ? Math.min(
                                        AUTO_MAX,
                                        Math.max(1, Math.round(value)),
                                      )
                                    : 1,
                                );
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            aria-label="Augmenter le nombre de billes"
                            disabled={auto || autoCount >= AUTO_MAX}
                            onClick={() => changeAutoCount(1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mines-pattern-mode-button"
                      disabled={!game.connected || (!auto && insufficient)}
                      aria-pressed={auto}
                      onClick={() => void startAuto()}
                    >
                      {auto ? (
                        <Square size={14} fill="currentColor" />
                      ) : (
                        <Repeat2 size={15} />
                      )}
                      <span>
                        {auto
                          ? "Arrêter la série"
                          : `Lancer ×${autoCount} · ${credits(bet * autoCount)} cr.`}
                      </span>
                    </button>
                    {message && !auto && (
                      <p className="mines-pattern-feedback" aria-live="polite">
                        {message}
                      </p>
                    )}
                  </>
                )}
              </GamePopoverControl>
            </GameControlsBar>
          </div>
          {game.error && (
            <p className="plinko-global-error" role="alert">
              {game.error}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

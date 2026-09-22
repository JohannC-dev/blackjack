"use client";

import {
  ArrowUp,
  ChevronDown,
  Crown,
  Minus,
  Plus,
  Repeat2,
  Square,
  Volume2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { playCasinoSound, preloadCasinoSounds } from "@/lib/casino-audio";
import {
  MINES_MAX_BET,
  MINES_MIN_BET,
  MINES_TARGET_OPTIONS,
  minesForTarget,
  minesPayout,
  type MinesTarget,
} from "@/lib/mines";
import { credits } from "@/lib/rules";
import {
  playTowerCashout,
  playTowerCollapse,
  playTowerJackpot,
  playTowerStart,
  playTowerStep,
  preloadTowerSounds,
} from "@/lib/tower-audio";
import type { MinesCell, MinesState } from "@/lib/types";
import { useGame } from "@/lib/use-game";
import { CasinoRail, ClubHeader, getClubBalance } from "../../shared";
import type { CasinoView } from "@/lib/navigation";
import {
  BetChipPicker,
  GameActionButton,
  GameControlGroup,
  GameControlsBar,
} from "../../shared/casino/game-controls";
import { MineBomb, MineDiamond } from "./mine-art";

type Game = ReturnType<typeof useGame>;

const MINES_LOOP_ROUND_DELAY = 650;
const MINES_LOOP_STATE_TIMEOUT = 8_000;
const MINES_LOOP_DEFAULT_COUNT = 10;
const MINES_LOOP_MAX_COUNT = 100;

const EMPTY_CELLS: MinesCell[] = Array.from({ length: 25 }, (_, index) => ({
  index,
  status: "hidden",
}));

function phaseDescription(state: MinesState | null) {
  if (!state || state.phase === "idle")
    return "Choisissez votre mise et votre retour visé.";
  if (state.phase === "playing") return state.message;
  return state.message;
}

function MinesCellButton({
  cell,
  active,
  disabled,
  patternEditable,
  patternPosition,
  onReveal,
}: {
  cell: MinesCell;
  active: boolean;
  disabled: boolean;
  patternEditable: boolean;
  patternPosition: number;
  onReveal: (index: number) => void;
}) {
  const label = patternEditable
    ? `${patternPosition >= 0 ? "Retirer" : "Sélectionner"} la case ${cell.index + 1} du pattern`
    : cell.status === "diamond"
      ? `Case ${cell.index + 1}, diamant`
      : cell.status === "mine"
        ? `Case ${cell.index + 1}, mine`
        : `Ouvrir la case ${cell.index + 1}`;
  return (
    <button
      type="button"
      className={`mine-cell ${cell.status} ${active ? "is-active" : ""}`}
      aria-label={label}
      disabled={disabled || (!patternEditable && cell.status !== "hidden")}
      onClick={() => onReveal(cell.index)}
    >
      <span className="mine-cell-glint" />
      {patternPosition >= 0 && (
        <span className="mine-cell-pattern" aria-hidden="true">
          {patternPosition + 1}
        </span>
      )}
      {cell.status === "diamond" ? (
        <MineDiamond className="mine-cell-art" />
      ) : cell.status === "mine" ? (
        <MineBomb className="mine-cell-art" />
      ) : (
        <span className="mine-cell-mark">+</span>
      )}
    </button>
  );
}

function MinesControls({
  game,
  state,
  bet,
  maxBet,
  betSteps,
  target,
  setTarget,
  onAdd,
  onUndo,
  onClear,
  onCashout,
  currentPayout,
  targetReached,
  onStart,
  patternLength,
  patternMode,
  looping,
  loopRounds,
  loopCount,
  loopMessage,
  onLoopCountChange,
  onStopLoop,
  onTogglePatternMode,
}: {
  game: Game;
  state: MinesState | null;
  bet: number;
  maxBet: number;
  betSteps: number[];
  target: MinesTarget;
  setTarget: (value: MinesTarget) => void;
  onAdd: (amount: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onCashout: () => void;
  currentPayout: number;
  targetReached: boolean;
  onStart: () => void;
  patternLength: number;
  patternMode: boolean;
  looping: boolean;
  loopRounds: number;
  loopCount: number;
  loopMessage: string;
  onLoopCountChange: (value: number) => void;
  onStopLoop: () => void;
  onTogglePatternMode: () => void;
}) {
  const active = state?.phase === "playing";
  const [patternOpen, setPatternOpen] = useState(false);
  const patternControlRef = useRef<HTMLDivElement>(null);
  const balance = getClubBalance(game);
  const targetMines = minesForTarget(target);
  const targetIndex = Math.max(
    0,
    MINES_TARGET_OPTIONS.findIndex((option) => option.target === target),
  );
  const targetOption =
    MINES_TARGET_OPTIONS[targetIndex] ?? MINES_TARGET_OPTIONS[0];
  const difficultyProgress =
    (targetIndex / Math.max(1, MINES_TARGET_OPTIONS.length - 1)) * 100;
  const difficultyDisabled = active || looping;
  const canStart =
    !active &&
    !looping &&
    game.connected &&
    bet >= MINES_MIN_BET &&
    bet <= maxBet &&
    bet <= balance &&
    (!patternMode || patternLength > 0);
  const previewPayout = minesPayout(bet, target / 100);
  const difficultyValueText = `${targetOption.target}% de retour, ${targetOption.mines} bombes, gain potentiel ${credits(previewPayout)} crédits`;

  const setDifficultyFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (difficultyDisabled) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = bounds.width
      ? Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      : 0;
    const index = Math.round(
      position * Math.max(1, MINES_TARGET_OPTIONS.length - 1),
    );
    const option = MINES_TARGET_OPTIONS[index];
    if (option) setTarget(option.target as MinesTarget);
  };

  const handleDifficultyKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (difficultyDisabled) return;
    let nextIndex = targetIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      nextIndex = Math.min(MINES_TARGET_OPTIONS.length - 1, targetIndex + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      nextIndex = Math.max(0, targetIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = MINES_TARGET_OPTIONS.length - 1;
    else return;

    event.preventDefault();
    const option = MINES_TARGET_OPTIONS[nextIndex];
    if (option) setTarget(option.target as MinesTarget);
  };

  const start = () => {
    if (!canStart) return;
    onStart();
  };
  const actionDisabled = looping
    ? false
    : active
      ? !state?.revealedCount || game.pending
      : !canStart || game.pending;
  const actionLabel = looping
    ? "Arrêter le pattern"
    : patternMode
      ? patternLength
        ? `Lancer ×${loopCount} · ${patternLength} case${patternLength === 1 ? "" : "s"}`
        : "Choisir un pattern"
      : active
        ? targetReached
          ? `Objectif atteint · ${credits(currentPayout)} cr.`
          : `Encaisser · ${credits(currentPayout)} cr.`
        : `${state && state.phase !== "idle" ? "Rejouer" : "Jouer"} · ${credits(bet)} cr.`;
  const actionSubline = looping
    ? `${loopRounds}/${loopCount} manche${loopCount === 1 ? "" : "s"} · cliquer pour arrêter`
    : patternMode
      ? patternLength
        ? `${minesForTarget(target)} bombes · ×${loopCount} manche${loopCount === 1 ? "" : "s"} · d’un coup`
        : "Sélectionnez des cases sur la grille"
      : active
        ? "Retirez votre gain maintenant"
        : `${targetMines} bombes · gain potentiel ${credits(previewPayout)} cr.`;
  const patternOptionDisabled = !looping && (active || game.pending);
  const patternStatus = looping
    ? "En cours"
    : patternMode
      ? patternLength
        ? "Prêt à lancer"
        : "À configurer"
      : patternLength
        ? "Désactivé"
        : "Optionnel";
  const loopCountDisabled = active || looping || game.pending;

  useEffect(() => {
    if (!patternOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        patternControlRef.current &&
        !patternControlRef.current.contains(event.target as Node)
      )
        setPatternOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPatternOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [patternOpen]);

  const changeLoopCount = (delta: number) =>
    onLoopCountChange(
      Math.min(MINES_LOOP_MAX_COUNT, Math.max(1, loopCount + delta)),
    );

  return (
    <>
      <GameControlsBar ariaLabel="Réglages de la partie">
        <GameControlGroup
          className="mines-difficulty-control"
          label="Risque / gain"
        >
          <div className="mines-difficulty-summary" aria-live="polite">
            <div className="mines-difficulty-current">
              <span>Retour visé</span>
              <b>{targetOption.target}%</b>
            </div>
            <div className="mines-difficulty-stat">
              <span>Bombes</span>
              <b>{targetOption.mines}</b>
            </div>
            <div className="mines-difficulty-stat is-payout">
              <span>Gain potentiel</span>
              <b>{credits(previewPayout)} cr.</b>
            </div>
          </div>
          <div
            className={`mines-difficulty-slider ${
              difficultyDisabled ? "is-disabled" : ""
            }`.trim()}
            role="slider"
            tabIndex={difficultyDisabled ? -1 : 0}
            aria-label="Risque et retour visé"
            aria-valuemin={0}
            aria-valuemax={MINES_TARGET_OPTIONS.length - 1}
            aria-valuenow={targetIndex}
            aria-valuetext={difficultyValueText}
            aria-disabled={difficultyDisabled}
            onKeyDown={handleDifficultyKeyDown}
            onPointerDown={(event) => {
              if (difficultyDisabled) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDifficultyFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                setDifficultyFromPointer(event);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          >
            <span className="mines-difficulty-track" />
            <span
              className="mines-difficulty-fill"
              style={{ width: `${difficultyProgress}%` }}
            />
            <span className="mines-difficulty-ticks" aria-hidden="true">
              {MINES_TARGET_OPTIONS.map((option, index) => (
                <i
                  key={option.target}
                  className={index <= targetIndex ? "is-passed" : ""}
                  style={{
                    left: `${
                      (index / Math.max(1, MINES_TARGET_OPTIONS.length - 1)) *
                      100
                    }%`,
                  }}
                />
              ))}
            </span>
            <span
              className="mines-difficulty-thumb"
              style={{ left: `${difficultyProgress}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="mines-difficulty-scale" aria-hidden="true">
            {MINES_TARGET_OPTIONS.map((option, index) => (
              <span
                key={option.target}
                className={`${index === targetIndex ? "is-selected" : ""} ${
                  index === 0 ? "is-first" : ""
                } ${
                  index === MINES_TARGET_OPTIONS.length - 1 ? "is-last" : ""
                }`.trim()}
                style={{
                  left: `${
                    (index / Math.max(1, MINES_TARGET_OPTIONS.length - 1)) * 100
                  }%`,
                }}
              >
                {option.target}%
              </span>
            ))}
          </div>
          <div className="mines-difficulty-hint" aria-hidden="true">
            <span>moins de bombes</span>
            <span>plus de bombes</span>
          </div>
        </GameControlGroup>

        <GameControlGroup
          className="mines-bet-control"
          label={
            <>
              Mise{" "}
              <b className="game-bet-amount">
                {credits(active && state ? state.bet : bet)} cr.
              </b>
            </>
          }
        >
          <BetChipPicker
            bet={bet}
            maxBet={maxBet}
            betSteps={betSteps}
            disabled={active || looping}
            onAdd={onAdd}
            onUndo={onUndo}
            onClear={onClear}
          />
        </GameControlGroup>

        <GameActionButton
          variant={looping ? "stop" : active ? "cashout" : "start"}
          busy={game.pending && !looping}
          disabled={actionDisabled}
          icon={
            looping ? (
              <Square size={18} fill="currentColor" />
            ) : active ? (
              <Crown size={18} />
            ) : (
              <ArrowUp size={18} />
            )
          }
          label={actionLabel}
          subline={actionSubline}
          onClick={looping ? onStopLoop : active ? onCashout : start}
        />
        <div
          ref={patternControlRef}
          className={`mines-loop-control ${
            looping ? "is-running" : ""
          } ${patternOpen ? "is-open" : ""}`.trim()}
        >
          <button
            type="button"
            className="mines-pattern-trigger"
            aria-haspopup="dialog"
            aria-expanded={patternOpen}
            aria-controls="mines-pattern-popover"
            onClick={() => setPatternOpen((current) => !current)}
          >
            <span className="mines-pattern-trigger-icon" aria-hidden="true">
              {looping ? (
                <Square size={14} fill="currentColor" />
              ) : (
                <Repeat2 size={15} />
              )}
            </span>
            <span className="mines-pattern-trigger-copy">
              <b>Pattern</b>
              <small>{patternStatus}</small>
            </span>
            <span className="mines-pattern-trigger-count">
              {patternLength}/25
            </span>
            <ChevronDown
              size={14}
              className="mines-pattern-trigger-chevron"
              aria-hidden="true"
            />
          </button>

          {patternOpen && (
            <div
              id="mines-pattern-popover"
              className="mines-pattern-popover"
              role="dialog"
              aria-label="Configurer le pattern"
            >
              <div className="mines-pattern-popover-heading">
                <div>
                  <span className="mines-pattern-kicker">MODE AUTOMATIQUE</span>
                  <strong>
                    {looping ? "Pattern en cours" : "Répéter une séquence"}
                  </strong>
                </div>
                <button
                  type="button"
                  className="mines-pattern-close"
                  aria-label="Fermer le panneau pattern"
                  onClick={() => setPatternOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
              <p className="mines-pattern-intro">
                Choisissez les cases dans l’ordre. À chaque manche, toute la
                séquence est révélée d’un coup puis encaissée automatiquement.
              </p>
              <ol className="mines-pattern-steps">
                <li className={patternMode ? "is-current" : ""}>
                  <b>1</b>
                  <span>
                    <strong>Activez le mode pattern</strong>
                    <small>
                      {patternMode
                        ? "La grille accepte votre séquence."
                        : "La grille reste en mode de jeu normal."}
                    </small>
                  </span>
                </li>
                <li className={patternLength ? "is-current" : ""}>
                  <b>2</b>
                  <span>
                    <strong>Sélectionnez les cases</strong>
                    <small>
                      {patternLength
                        ? `${patternLength} case${patternLength === 1 ? "" : "s"} dans l’ordre indiqué.`
                        : "Cliquez sur la grille dans l’ordre voulu."}
                    </small>
                  </span>
                </li>
                <li className={patternLength ? "is-current" : ""}>
                  <b>3</b>
                  <span>
                    <strong>Lancez les manches</strong>
                    <small>
                      {looping
                        ? `${loopRounds}/${loopCount} manche${loopCount === 1 ? "" : "s"} terminée${loopCount === 1 ? "" : "s"}.`
                        : `Le bouton principal lancera ×${loopCount} manche${loopCount === 1 ? "" : "s"}.`}
                    </small>
                  </span>
                </li>
              </ol>
              <div className="mines-pattern-settings">
                <div className="mines-pattern-setting">
                  <span>Cases sélectionnées</span>
                  <b>{patternLength}/25</b>
                </div>
                <div className="mines-pattern-setting">
                  <span>Nombre de manches</span>
                  <div className="mines-pattern-stepper">
                    <button
                      type="button"
                      aria-label="Diminuer le nombre de manches"
                      disabled={loopCountDisabled || loopCount <= 1}
                      onClick={() => changeLoopCount(-1)}
                    >
                      <Minus size={13} />
                    </button>
                    <label>
                      <span aria-hidden="true">×</span>
                      <input
                        type="number"
                        min="1"
                        max={MINES_LOOP_MAX_COUNT}
                        step="1"
                        value={loopCount}
                        disabled={loopCountDisabled}
                        aria-label="Nombre de manches du pattern"
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value);
                          onLoopCountChange(
                            Number.isFinite(value)
                              ? Math.min(
                                  MINES_LOOP_MAX_COUNT,
                                  Math.max(1, Math.round(value)),
                                )
                              : 1,
                          );
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Augmenter le nombre de manches"
                      disabled={
                        loopCountDisabled || loopCount >= MINES_LOOP_MAX_COUNT
                      }
                      onClick={() => changeLoopCount(1)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="mines-pattern-mode-button"
                disabled={patternOptionDisabled}
                aria-pressed={patternMode || looping}
                onClick={onTogglePatternMode}
              >
                {looping ? (
                  <Square size={14} fill="currentColor" />
                ) : (
                  <Repeat2 size={15} />
                )}
                <span>
                  {looping
                    ? "Arrêter la boucle"
                    : patternMode
                      ? "Désactiver le mode pattern"
                      : "Activer le mode pattern"}
                </span>
              </button>
              {loopMessage && !looping && (
                <p className="mines-pattern-feedback" aria-live="polite">
                  {loopMessage}
                </p>
              )}
            </div>
          )}
        </div>
      </GameControlsBar>
      {(!game.connected || balance < bet) && (
        <div className="mines-control-errors">
          {!game.connected && (
            <small className="mines-control-error">Connexion au serveur…</small>
          )}
          {balance < bet && (
            <small className="mines-control-error">
              Solde insuffisant pour cette mise.
            </small>
          )}
        </div>
      )}
    </>
  );
}

export function MinesCasino({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: (view: CasinoView) => void;
}) {
  const state = game.minesState;
  const [bet, setBet] = useState(25);
  const [betSteps, setBetSteps] = useState<number[]>([]);
  const [target, setTarget] = useState<MinesTarget>(200);
  const [sound, setSound] = useState(false);
  const [pattern, setPattern] = useState<number[]>([]);
  const [patternMode, setPatternMode] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopRounds, setLoopRounds] = useState(0);
  const [loopCount, setLoopCount] = useState(MINES_LOOP_DEFAULT_COUNT);
  const [loopMessage, setLoopMessage] = useState("");
  const active = state?.phase === "playing";
  const cells = state?.cells ?? EMPTY_CELLS;
  const balance = getClubBalance(game);
  const maxBet = Math.min(MINES_MAX_BET, Math.floor(balance));
  const liveBet = state?.bet ?? bet;
  const liveTarget = state?.target ?? target;
  const currentMultiplier = state?.multiplier ?? 1;
  const currentPayout = active
    ? minesPayout(liveBet, currentMultiplier)
    : (state?.payout ?? 0);
  const targetReached = currentMultiplier >= liveTarget / 100;
  const hiddenCount = useMemo(
    () => cells.filter((cell) => cell.status === "hidden").length,
    [cells],
  );
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);
  soundRef.current = sound;
  const previousState = useRef<MinesState | null>(null);
  const initialized = useRef(false);
  const stateRef = useRef<MinesState | null>(state);
  const balanceRef = useRef(balance);
  const patternRef = useRef<number[]>([]);
  const loopRef = useRef({ id: 0, running: false });
  stateRef.current = state;
  balanceRef.current = balance;

  const play = useCallback(
    (effect: Parameters<typeof playCasinoSound>[1], count = 1) => {
      if (soundRef.current && audioRef.current)
        playCasinoSound(audioRef.current, effect, count);
    },
    [],
  );
  const sfx = useCallback((effect: (context: AudioContext) => void) => {
    if (soundRef.current && audioRef.current) effect(audioRef.current);
  }, []);

  useEffect(() => {
    const previous = previousState.current;
    previousState.current = state;
    if (!state) return;
    if (!initialized.current) {
      initialized.current = true;
      return;
    }

    if (!previous || state.round !== previous.round) {
      play("chips");
      sfx(playTowerStart);
      return;
    }

    if (
      state.phase !== "lost" &&
      state.revealedCount > previous.revealedCount
    ) {
      sfx((context) =>
        playTowerStep(context, Math.min(10, state.revealedCount)),
      );
    }

    if (previous.phase !== "playing" || state.phase === "playing") return;
    if (state.phase === "lost") {
      sfx((context) => playTowerCollapse(context, 0));
    } else {
      play("chips", 2);
      sfx((context) =>
        state.phase === "won"
          ? playTowerJackpot(context)
          : playTowerCashout(context, Math.max(1, state.revealedCount)),
      );
    }
  }, [play, sfx, state]);

  const reveal = useCallback(
    (index: number) => {
      if (!active || patternMode || game.pending || looping) return;
      void game.minesCommand({ type: "reveal", index });
    },
    [active, game, looping, patternMode],
  );
  const selectPatternCell = useCallback(
    (index: number) => {
      if (!patternMode || active || game.pending || looping) return;
      setPattern((current) => {
        const next = current.includes(index)
          ? current.filter((item) => item !== index)
          : [...current, index];
        patternRef.current = next;
        return next;
      });
    },
    [active, game.pending, looping, patternMode],
  );
  const cashout = useCallback(() => {
    if (!active || looping || !state?.revealedCount || game.pending) return;
    void game.minesCommand({ type: "cashout" });
  }, [active, game, looping, state?.revealedCount]);
  const addChip = useCallback(
    (amount: number) => {
      if (active || looping || bet + amount > maxBet) return;
      setBet((current) => current + amount);
      setBetSteps((current) => [...current, amount]);
      play("chips");
    },
    [active, bet, looping, maxBet, play],
  );
  const undoChip = useCallback(() => {
    if (active || looping) return;
    setBetSteps((current) => {
      const last = current.at(-1);
      if (last === undefined) return current;
      setBet((value) => Math.max(0, value - last));
      return current.slice(0, -1);
    });
  }, [active, looping]);
  const clearBet = useCallback(() => {
    if (active || looping) return;
    setBet(0);
    setBetSteps([]);
  }, [active, looping]);

  const waitForLoopState = useCallback(
    (runId: number, predicate: (snapshot: MinesState | null) => boolean) =>
      new Promise<boolean>((resolve) => {
        const startedAt = Date.now();
        const check = () => {
          if (loopRef.current.id !== runId || !loopRef.current.running) {
            resolve(false);
            return;
          }
          if (predicate(stateRef.current)) {
            resolve(true);
            return;
          }
          if (Date.now() - startedAt >= MINES_LOOP_STATE_TIMEOUT) {
            resolve(false);
            return;
          }
          window.setTimeout(check, 45);
        };
        check();
      }),
    [],
  );

  const pauseLoop = useCallback(
    (runId: number, duration: number) =>
      new Promise<boolean>((resolve) => {
        window.setTimeout(
          () =>
            resolve(loopRef.current.id === runId && loopRef.current.running),
          duration,
        );
      }),
    [],
  );

  const stopLoop = useCallback(() => {
    if (!loopRef.current.running) return;
    loopRef.current.running = false;
    loopRef.current.id += 1;
    setLooping(false);
    setLoopMessage("Boucle arrêtée.");
  }, []);

  const startLoop = useCallback(() => {
    const sequence = [...patternRef.current];
    const loopBet = bet;
    const loopTarget = target;
    const roundsToPlay = Math.min(
      MINES_LOOP_MAX_COUNT,
      Math.max(1, Math.round(loopCount)),
    );
    if (
      loopRef.current.running ||
      !sequence.length ||
      !patternMode ||
      active ||
      game.pending ||
      !game.connected ||
      loopBet < MINES_MIN_BET ||
      loopBet > maxBet ||
      loopBet > balanceRef.current
    )
      return;

    const runId = loopRef.current.id + 1;
    loopRef.current = { id: runId, running: true };
    setLooping(true);
    setLoopRounds(0);
    setLoopMessage("");

    void (async () => {
      let rounds = 0;
      let stopReason = "";
      const isRunning = () =>
        loopRef.current.id === runId && loopRef.current.running;

      try {
        while (isRunning() && rounds < roundsToPlay) {
          if (balanceRef.current < loopBet) {
            stopReason = "Solde insuffisant : boucle arrêtée.";
            break;
          }

          const previousRound = stateRef.current?.round ?? 0;
          if (
            !(await game.minesCommand({
              type: "playPattern",
              bet: loopBet,
              target: loopTarget,
              indexes: sequence,
            }))
          ) {
            stopReason = `La manche ${rounds + 1} n’a pas pu être lancée.`;
            break;
          }
          if (
            !(await waitForLoopState(
              runId,
              (snapshot) =>
                !!snapshot &&
                snapshot.round > previousRound &&
                snapshot.phase !== "playing",
            ))
          ) {
            if (isRunning()) stopReason = "La boucle a été interrompue.";
            break;
          }

          rounds += 1;
          setLoopRounds(rounds);
          if (!(await pauseLoop(runId, MINES_LOOP_ROUND_DELAY))) break;
        }
        if (rounds >= roundsToPlay && isRunning()) {
          stopReason = `Boucle terminée : ${rounds} manche${rounds === 1 ? "" : "s"}.`;
        }
      } finally {
        if (loopRef.current.id !== runId) return;
        loopRef.current.running = false;
        setLooping(false);
        if (stopReason) setLoopMessage(stopReason);
      }
    })();
  }, [
    active,
    balanceRef,
    bet,
    game,
    maxBet,
    pauseLoop,
    loopCount,
    patternMode,
    target,
    waitForLoopState,
  ]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const startRound = useCallback(() => {
    if (patternMode) startLoop();
    else void game.minesCommand({ type: "start", bet, target });
  }, [bet, game, patternMode, startLoop, target]);

  const togglePatternMode = useCallback(() => {
    if (looping) {
      stopLoop();
      return;
    }
    if (active || game.pending) return;
    setPatternMode((current) => !current);
    setLoopMessage("");
  }, [active, game.pending, looping, stopLoop]);

  const patternEditable = patternMode && !active && !looping && !game.pending;
  const boardCells = patternEditable ? EMPTY_CELLS : cells;

  return (
    <div className="casino-shell mines-shell">
      <CasinoRail active="mines" onNavigate={onNavigate} />
      <div className="ml-[76px] max-[700px]:ml-[55px] max-[450px]:ml-0">
        <ClubHeader balance={balance} name={game.profile?.name ?? ""} />
        <main className="mines-page">
          <header className="mines-page-heading">
            <div className="mines-title-block">
              <span className="eyebrow">
                LE CLUB <span>/</span> JEU SOLO &amp; LIVE
              </span>
              <h1>
                La <em>Mine</em>
              </h1>
            </div>
            <div className="mines-page-actions">
              <button
                type="button"
                className={`poker-sound ${sound ? "active" : ""}`}
                aria-label={sound ? "Couper les sons" : "Activer les sons"}
                onClick={() => {
                  const context = (audioRef.current ??= new AudioContext());
                  void context.resume();
                  preloadCasinoSounds(context);
                  preloadTowerSounds(context);
                  setSound(!sound);
                }}
              >
                <Volume2 size={15} />
              </button>
            </div>
          </header>

          <div className="mines-game-layout">
            <section
              className="mines-board-stage"
              aria-label="Grille du jeu de la mine"
            >
              <div className="mines-board-wrap">
                <div className="mines-board-ornament mines-board-ornament-left" />
                <div
                  className="mines-grid"
                  role="grid"
                  aria-label="25 cases cachées"
                >
                  {boardCells.map((cell) => (
                    <MinesCellButton
                      key={cell.index}
                      cell={cell}
                      active={!!active || patternEditable}
                      disabled={
                        patternEditable
                          ? false
                          : !active || game.pending || looping
                      }
                      patternEditable={patternEditable}
                      patternPosition={
                        patternMode ? pattern.indexOf(cell.index) : -1
                      }
                      onReveal={patternEditable ? selectPatternCell : reveal}
                    />
                  ))}
                </div>
                <div className="mines-board-ornament mines-board-ornament-right" />
              </div>

              <div className="mines-board-footer">
                <div className="mines-message" aria-live="polite">
                  <span className="mines-message-icon">
                    {state?.phase === "lost" ? <MineBomb /> : <MineDiamond />}
                  </span>
                  <p>
                    <strong>
                      {loopMessage && !looping
                        ? "Pattern terminé"
                        : patternEditable
                          ? pattern.length
                            ? "Pattern prêt"
                            : "Construisez votre pattern"
                          : looping
                            ? "Pattern en boucle"
                            : phaseDescription(state)}
                    </strong>
                    <small>
                      {loopMessage && !looping
                        ? loopMessage
                        : patternEditable
                          ? pattern.length
                            ? `${pattern.length} case${pattern.length === 1 ? "" : "s"} · ordre numéroté · ${loopCount} manche${loopCount === 1 ? "" : "s"}`
                            : "1. Cliquez dans l’ordre · 2. choisissez le nombre de manches · 3. lancez"
                          : looping
                            ? `${pattern.length} case${pattern.length === 1 ? "" : "s"} révélée${pattern.length === 1 ? "" : "s"} d’un coup · ${loopRounds}/${loopCount} manche${loopCount === 1 ? "" : "s"}`
                            : active
                              ? `${state?.revealedCount ?? 0} diamant${state?.revealedCount === 1 ? "" : "s"} trouvé${state?.revealedCount === 1 ? "" : "s"} · ${hiddenCount} cases restantes`
                              : "Les cases sont tirées et vérifiées par le serveur."}
                    </small>
                  </p>
                </div>
              </div>
            </section>
            <MinesControls
              game={game}
              state={state}
              bet={bet}
              maxBet={maxBet}
              betSteps={betSteps}
              target={target}
              setTarget={setTarget}
              onAdd={addChip}
              onUndo={undoChip}
              onClear={clearBet}
              onCashout={cashout}
              currentPayout={currentPayout}
              targetReached={targetReached}
              onStart={startRound}
              patternLength={pattern.length}
              patternMode={patternMode}
              looping={looping}
              loopRounds={loopRounds}
              loopMessage={loopMessage}
              loopCount={loopCount}
              onLoopCountChange={setLoopCount}
              onStopLoop={stopLoop}
              onTogglePatternMode={togglePatternMode}
            />
          </div>
          {game.error && (
            <p className="mines-global-error" role="alert">
              {game.error}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

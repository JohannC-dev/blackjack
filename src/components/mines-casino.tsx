"use client";

import { ArrowUp, Crown, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CasinoRail, ClubHeader, getClubBalance } from "./poker-casino";
import type { CasinoView } from "./casino";
import {
  BetChipPicker,
  GameActionButton,
  GameControlGroup,
  GameControlsBar,
  GameOption,
} from "./game-controls";
import { MineBomb, MineDiamond } from "./mine-art";

type Game = ReturnType<typeof useGame>;

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
  onReveal,
}: {
  cell: MinesCell;
  active: boolean;
  disabled: boolean;
  onReveal: (index: number) => void;
}) {
  const label =
    cell.status === "diamond"
      ? `Case ${cell.index + 1}, diamant`
      : cell.status === "mine"
        ? `Case ${cell.index + 1}, mine`
        : `Ouvrir la case ${cell.index + 1}`;
  return (
    <button
      type="button"
      className={`mine-cell ${cell.status} ${active ? "is-active" : ""}`}
      aria-label={label}
      disabled={disabled || cell.status !== "hidden"}
      onClick={() => onReveal(cell.index)}
    >
      <span className="mine-cell-glint" />
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
}) {
  const active = state?.phase === "playing";
  const balance = getClubBalance(game);
  const targetMines = minesForTarget(target);
  const canStart =
    !active &&
    game.connected &&
    bet >= MINES_MIN_BET &&
    bet <= maxBet &&
    bet <= balance;
  const previewPayout = minesPayout(bet, target / 100);

  const start = () => {
    if (!canStart) return;
    void game.minesCommand({ type: "start", bet, target });
  };
  const actionDisabled = active
    ? !state?.revealedCount || game.pending
    : !canStart || game.pending;
  const actionLabel = active
    ? targetReached
      ? `Objectif atteint · ${credits(currentPayout)} cr.`
      : `Encaisser · ${credits(currentPayout)} cr.`
    : `${state && state.phase !== "idle" ? "Rejouer" : "Jouer"} · ${credits(bet)} cr.`;
  const actionSubline = active
    ? "Retirez votre gain maintenant"
    : `${targetMines} mines · jusqu’à ${credits(previewPayout)} cr.`;

  return (
    <>
      <GameControlsBar ariaLabel="Réglages de la partie">
        <GameControlGroup label="Difficulté / retour">
          <div
            className="game-options is-compact"
            role="radiogroup"
            aria-label="Retour visé"
          >
            {MINES_TARGET_OPTIONS.map((option) => (
              <GameOption
                key={option.target}
                tone="mines"
                compact
                selected={target === option.target}
                disabled={active}
                onClick={() => setTarget(option.target as MinesTarget)}
              >
                <b>{option.target}%</b>
                <small>{option.mines} mines</small>
              </GameOption>
            ))}
          </div>
        </GameControlGroup>

        <GameControlGroup
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
            disabled={active}
            onAdd={onAdd}
            onUndo={onUndo}
            onClear={onClear}
          />
        </GameControlGroup>

        <GameActionButton
          variant={active ? "cashout" : "start"}
          busy={game.pending}
          disabled={actionDisabled}
          icon={active ? <Crown size={18} /> : <ArrowUp size={18} />}
          label={actionLabel}
          subline={actionSubline}
          onClick={active ? onCashout : start}
        />
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
      if (!active || game.pending) return;
      void game.minesCommand({ type: "reveal", index });
    },
    [active, game],
  );
  const cashout = useCallback(() => {
    if (!active || !state?.revealedCount || game.pending) return;
    void game.minesCommand({ type: "cashout" });
  }, [active, game, state?.revealedCount]);
  const addChip = useCallback(
    (amount: number) => {
      if (active || bet + amount > maxBet) return;
      setBet((current) => current + amount);
      setBetSteps((current) => [...current, amount]);
      play("chips");
    },
    [active, bet, maxBet, play],
  );
  const undoChip = useCallback(() => {
    if (active) return;
    setBetSteps((current) => {
      const last = current.at(-1);
      if (last === undefined) return current;
      setBet((value) => Math.max(0, value - last));
      return current.slice(0, -1);
    });
  }, [active]);
  const clearBet = useCallback(() => {
    if (active) return;
    setBet(0);
    setBetSteps([]);
  }, [active]);

  return (
    <div className="casino-shell mines-shell">
      <CasinoRail active="mines" onNavigate={onNavigate} />
      <div className="workspace">
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
                  {cells.map((cell) => (
                    <MinesCellButton
                      key={cell.index}
                      cell={cell}
                      active={active ?? false}
                      disabled={!active || game.pending}
                      onReveal={reveal}
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
                    <strong>{phaseDescription(state)}</strong>
                    <small>
                      {active
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

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  ChevronDown,
  CircleHelp,
  Play,
  Repeat2,
  Square,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { CasinoView } from "@/lib/navigation";
import { credits } from "@/lib/rules";
import {
  CHICKEN_DIFFICULTIES,
  CHICKEN_DIFFICULTY_ORDER,
  CHICKEN_MAX_BET,
  CHICKEN_MIN_BET,
  CHICKEN_MULTIPLIERS,
  chickenBet,
  chickenMultiplier,
  chickenPayout,
} from "@/lib/chicken";
import type {
  ChickenAutoConfig,
  ChickenDifficulty,
  ChickenRun,
} from "@/lib/types";
import { playCasinoSound, preloadCasinoSounds } from "@/lib/casino-audio";
import { useGameAudio } from "@/lib/audio-context";
import {
  playChickenCashout,
  playChickenCollision,
  playChickenStart,
  playChickenStep,
} from "@/lib/chicken-audio";
import { useGame } from "@/lib/use-game";
import {
  BetChipPicker,
  CasinoRail,
  ClubHeader,
  GameActionButton,
  GameControlGroup,
  GameControlsBar,
  GameOption,
  GamePopoverPortal,
  getClubBalance,
} from "../../ui";
import { ChickenArt, ChickenBarrierArt, ChickenCarArt } from "./chicken-art";
import { SkinImage } from "../../ui/skin-image";
import { skinOf } from "@/lib/cosmetics";
import { useMySkins, useTableSkins } from "@/lib/cosmetics-api";
import styles from "./chicken.module.css";

type Game = ReturnType<typeof useGame>;
type Scene = {
  runId: string | null;
  step: number;
  lost: boolean;
  recentSteps: number[];
  fatalFrom: number;
};
const money = (value: number) => `${credits(value)} cr`;
const multiplier = (value: number) =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)}×`;
const carColors = ["#e3a747", "#7f9fc5", "#cd7b70", "#89afa1", "#b18bc2"];

export function ChickenCasino({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: (view: CasinoView) => void;
}) {
  const state = game.chickenState;
  const run = state?.run;
  const active = run?.status === "playing";
  const autoRunning = Boolean(state?.auto);
  const { enabled: sound, contextRef: audioRef } =
    useGameAudio(preloadCasinoSounds);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const previousRun = useRef<ChickenRun | null | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<ChickenDifficulty>("medium");
  const [bet, setBet] = useState<number>(CHICKEN_MIN_BET);
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [autoOpen, setAutoOpen] = useState(false);
  const autoControlRef = useRef<HTMLDivElement>(null);
  const autoPopoverRef = useRef<HTMLDivElement>(null);
  const [steps, setSteps] = useState(3);
  const [rounds, setRounds] = useState(10);
  const [stopProfit, setStopProfit] = useState(0);
  const [stopLoss, setStopLoss] = useState(0);
  const [onWinPercent, setOnWinPercent] = useState(0);
  const [onLossPercent, setOnLossPercent] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const currentDifficulty = active ? run.difficulty : difficulty;
  const maxSteps = CHICKEN_MULTIPLIERS[currentDifficulty].length;
  const currentStep = run?.step ?? 0;
  const runId = run?.id ?? null;
  const balance = getClubBalance(game);
  const maxBet = Math.min(CHICKEN_MAX_BET, Math.floor(balance));
  const [scene, setScene] = useState<Scene>(() => ({
    runId,
    step: currentStep,
    lost: run?.status === "lost",
    recentSteps: [],
    fatalFrom: -360,
  }));
  const carRefs = useRef(new Map<number, HTMLDivElement>());
  const recentTimers = useRef(new Set<number>());
  const [transitioning, setTransitioning] = useState(false);
  const sceneCurrent = scene.runId === runId;
  const visualStep = sceneCurrent ? scene.step : currentStep;
  const visualLost = sceneCurrent ? scene.lost : run?.status === "lost";
  const displayStep = visualLost ? Math.min(visualStep + 1, 20) : visualStep;
  const ghosts = (state?.ghosts ?? []).filter(
    (ghost) => ghost.playerId !== game.playerId,
  );
  const mySkins = useMySkins();
  // The other chickens wear their owner's skin, read again at each run.
  const ghostSkins = useTableSkins(
    ghosts.map((ghost) => ghost.playerId),
    run?.id,
  );
  const sceneBusy =
    !sceneCurrent ||
    currentStep > visualStep ||
    (run?.status === "lost" && !visualLost);
  const disabled =
    !game.connected || game.pending || !state || sceneBusy || transitioning;
  const validAuto =
    Number.isInteger(steps) &&
    steps >= 1 &&
    steps <= CHICKEN_MULTIPLIERS[difficulty].length &&
    Number.isInteger(rounds) &&
    rounds >= 1 &&
    rounds <= 1000 &&
    stopProfit >= 0 &&
    stopLoss >= 0 &&
    onWinPercent >= -100 &&
    onWinPercent <= 500 &&
    onLossPercent >= -100 &&
    onLossPercent <= 500;

  useEffect(() => {
    game.enterChicken();
    return game.leaveChicken;
  }, [game.enterChicken, game.leaveChicken]);

  useEffect(() => {
    if (run?.status === "playing") setDifficulty(run.difficulty);
  }, [run?.difficulty, run?.status]);

  useEffect(() => {
    const previous = previousRun.current;
    previousRun.current = run ?? null;
    if (previous === undefined || !run) return;
    const context = audioRef.current;
    if (!soundRef.current || !context) return;

    if (!previous || previous.id !== run.id) {
      if (run.status === "playing") playChickenStart(context);
      return;
    }
    if (previous.status !== "playing") return;
    if (run.status === "lost") playChickenCollision(context);
    else if (run.status === "cashed" || run.status === "finished")
      playChickenCashout(context, run.step > previous.step ? 0.35 : 0);
  }, [run]);

  useEffect(
    () => () => {
      for (const timer of recentTimers.current) window.clearTimeout(timer);
      recentTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!autoOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        !autoControlRef.current?.contains(event.target as Node) &&
        !autoPopoverRef.current?.contains(event.target as Node)
      )
        setAutoOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAutoOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [autoOpen]);

  useLayoutEffect(() => {
    if (!sceneCurrent) {
      for (const timer of recentTimers.current) window.clearTimeout(timer);
      recentTimers.current.clear();
      setTransitioning(false);
      setScene({
        runId,
        step: currentStep,
        lost: run?.status === "lost",
        recentSteps: [],
        fatalFrom: -360,
      });
      return;
    }
    if (!run) return;

    const car = carRefs.current.get(visualStep + 1);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (currentStep > visualStep) {
      if (!autoRunning && !reduceMotion) setTransitioning(true);
      const finishSafe = () => {
        const nextStep = visualStep + 1;
        const context = audioRef.current;
        if (soundRef.current && context) playChickenStep(context, nextStep);
        setScene((previous) => ({
          ...previous,
          step: nextStep,
          recentSteps: reduceMotion
            ? previous.recentSteps
            : [...previous.recentSteps, nextStep],
        }));
        if (reduceMotion) {
          setTransitioning(false);
          return;
        }
        const timer = window.setTimeout(() => {
          recentTimers.current.delete(timer);
          setScene((previous) =>
            previous.runId === runId
              ? {
                  ...previous,
                  recentSteps: previous.recentSteps.filter(
                    (step) => step !== nextStep,
                  ),
                }
              : previous,
          );
          setTransitioning(false);
        }, 700);
        recentTimers.current.add(timer);
      };
      if (!car || reduceMotion) {
        finishSafe();
        return;
      }
      const animation = car.animate(
        [
          { transform: getComputedStyle(car).transform },
          { transform: "translateY(620px)" },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(.35,0,.9,.7)",
          fill: "forwards",
        },
      );
      let cancelled = false;
      void animation.finished.then(
        () => {
          if (!cancelled) finishSafe();
        },
        () => {},
      );
      return () => {
        cancelled = true;
        animation.cancel();
      };
    }

    if (run.status === "lost" && !visualLost) {
      const laneHeight = car?.parentElement?.clientHeight ?? 400;
      const carTop = car?.parentElement
        ? car.getBoundingClientRect().top -
          car.parentElement.getBoundingClientRect().top
        : -150;
      const alreadyPassed = carTop > laneHeight * 0.5 - 125;
      if (alreadyPassed && car && !reduceMotion) {
        const animation = car.animate(
          [
            { transform: getComputedStyle(car).transform },
            { transform: "translateY(620px)" },
          ],
          { duration: 170, easing: "ease-in", fill: "forwards" },
        );
        let cancelled = false;
        void animation.finished.then(
          () => {
            if (!cancelled)
              setScene((previous) => ({
                ...previous,
                lost: true,
                fatalFrom: -360,
              }));
          },
          () => {},
        );
        return () => {
          cancelled = true;
          animation.cancel();
        };
      }
      setScene((previous) => ({
        ...previous,
        lost: true,
        fatalFrom: carTop - laneHeight / 2,
      }));
    }
  }, [
    sceneCurrent,
    runId,
    run?.status,
    currentStep,
    visualStep,
    visualLost,
    autoRunning,
  ]);

  const autoConfig = useMemo(
    (): ChickenAutoConfig => ({
      bet,
      difficulty,
      steps,
      rounds,
      stopProfit,
      stopLoss,
      onWinPercent,
      onLossPercent,
    }),
    [
      bet,
      difficulty,
      steps,
      rounds,
      stopProfit,
      stopLoss,
      onWinPercent,
      onLossPercent,
    ],
  );

  const selectChip = useCallback(
    (amount: number) => {
      if (active || autoRunning || amount > maxBet) return;
      setBet(amount);
      if (sound && audioRef.current) playCasinoSound(audioRef.current, "chips");
    },
    [active, autoRunning, audioRef, maxBet, sound],
  );

  const start = () => {
    if (
      disabled ||
      !chickenBet(bet) ||
      bet > balance ||
      (mode === "auto" && !validAuto)
    )
      return;
    if (mode === "auto")
      void game.chickenCommand({ type: "auto:start", config: autoConfig });
    else void game.chickenCommand({ type: "start", difficulty, bet });
  };
  const advance = () => {
    if (!disabled && active && !autoRunning)
      void game.chickenCommand({ type: "advance" });
  };
  const cashout = () => {
    if (!disabled && active && currentStep > 0)
      void game.chickenCommand({ type: "cashout" });
  };

  return (
    <div className="casino-shell chicken-shell">
      <CasinoRail active="chicken" onNavigate={onNavigate} />
      <div className="ml-[76px] max-[700px]:ml-[55px] max-[450px]:ml-0">
        <ClubHeader
          balance={getClubBalance(game)}
          name={game.profile?.name ?? ""}
          onSignOut={game.signOut}
        />
        <main className={styles.page}>
          <header className={styles.strip}>
            <div className={styles.titleBlock}>
              <span className="eyebrow">LE CLUB / JEU SOLO & LIVE</span>
              <h1>
                Le <span>Poulet</span>
              </h1>
            </div>
            <div className={styles.stripTools}>
              <button
                type="button"
                className="poker-sound"
                aria-label="Règles de Chicken"
                aria-expanded={showRules}
                onClick={() => setShowRules(!showRules)}
              >
                <CircleHelp size={15} />
              </button>
            </div>
          </header>

          {showRules && (
            <section className={styles.rules} aria-label="Règles de Chicken">
              <button
                type="button"
                className={styles.rulesClose}
                aria-label="Fermer les règles"
                onClick={() => setShowRules(false)}
              >
                <X size={16} />
              </button>
              <h2>Un saut à la fois</h2>
              <p>
                Misez, choisissez la difficulté, puis touchez la route pour
                avancer. Chaque traversée sûre pose un plot et augmente le
                multiplicateur. Encaissez avant la voie fatale. Les voitures
                illustrent la circulation ; le résultat de chaque saut est
                déterminé par le jeu. Les autres poulets jouent en direct chacun
                à son rythme.
              </p>
            </section>
          )}

          <section className={styles.stage} aria-label="Route de Chicken">
            <div className={styles.roadViewport}>
              <div
                key={run?.id ?? "preview"}
                className={styles.roadWorld}
                style={
                  {
                    "--camera": Math.max(0, displayStep - 2),
                    "--camera-mobile": Math.max(0, displayStep - 1),
                  } as CSSProperties
                }
              >
                <div className={styles.startLane}>
                  <span className={styles.treeTop} aria-hidden="true" />
                  <span className={styles.streetLamp} aria-hidden="true" />
                  <span className={styles.treeBottom} aria-hidden="true" />
                </div>
                {Array.from({ length: 20 }, (_, index) => {
                  const step = index + 1;
                  const lane = step;
                  const value = CHICKEN_MULTIPLIERS[currentDifficulty][index];
                  return (
                    <div
                      key={step}
                      className={`${styles.trafficLane} ${step <= visualStep ? styles.crossedLane : ""} ${sceneCurrent && scene.recentSteps.includes(step) ? styles.recentLane : ""} ${visualLost && step === displayStep ? styles.fatalLane : ""}`}
                      style={
                        {
                          "--lane": lane,
                          "--delay": `${-((lane * 2.37) % 11)}s`,
                          "--duration": `${8 + (lane % 5) * 1.4}s`,
                          "--fatal-from": `${scene.fatalFrom}px`,
                        } as CSSProperties
                      }
                    >
                      {value && (
                        <span className={styles.lanePayout}>
                          {multiplier(value)}
                        </span>
                      )}
                      {(step <= visualStep ||
                        (step > displayStep && step <= displayStep + 5) ||
                        step === displayStep) && (
                        <div
                          className={styles.carTrack}
                          aria-hidden="true"
                          ref={(node) => {
                            if (node) carRefs.current.set(step, node);
                            else carRefs.current.delete(step);
                          }}
                        >
                          <ChickenCarArt
                            color={carColors[index % carColors.length]}
                          />
                        </div>
                      )}
                      {step <= visualStep && (
                        <ChickenBarrierArt className={styles.barrier} />
                      )}
                    </div>
                  );
                })}
                {ghosts.map((ghost, index) => (
                  <div
                    key={ghost.playerId}
                    className={styles.ghost}
                    style={
                      {
                        "--position": ghost.step + 0.5,
                        "--offset": `${((index % 5) - 2) * 11}%`,
                      } as CSSProperties
                    }
                  >
                    <span>{ghost.name}</span>
                    <SkinImage
                      src={skinOf(
                        ghostSkins[ghost.playerId],
                        mySkins,
                        "chicken",
                      )}
                      fallback={<ChickenArt className={styles.sprite} />}
                      className={styles.sprite}
                    />
                  </div>
                ))}
                <div
                  className={`${styles.player} ${visualLost ? styles.crashed : ""}`}
                  data-hop={visualStep > 0 && !visualLost ? "true" : undefined}
                  style={
                    {
                      "--position": displayStep + 0.5,
                    } as CSSProperties
                  }
                >
                  <span>VOUS</span>
                  <SkinImage
                    key={`${run?.id ?? "idle"}-${displayStep}`}
                    src={mySkins?.chicken}
                    fallback={<ChickenArt className={styles.sprite} />}
                    className={styles.sprite}
                  />
                  {visualStep > 0 && !visualLost && (
                    <i
                      key={`landing-${run?.id ?? "idle"}-${visualStep}`}
                      className={styles.landing}
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
              <button
                type="button"
                className={styles.roadTap}
                onClick={advance}
                disabled={!active || autoRunning || disabled}
                aria-label="Faire avancer le poulet d’une voie"
              />
              {visualLost && (
                <div className={`${styles.result} ${styles.loss}`}>
                  LA VOIE ÉTAIT FATALE
                </div>
              )}
              {(run?.status === "cashed" || run?.status === "finished") &&
                !sceneBusy && (
                  <div className={`${styles.result} ${styles.win}`}>
                    ENCAISSÉ · {money(run.payout)}
                  </div>
                )}
            </div>
            <div className={styles.stageFooter}>
              <strong className={styles.runInfo}>
                {String(visualStep).padStart(2, "0")}/
                {String(maxSteps).padStart(2, "0")}
                <span>
                  {visualStep
                    ? multiplier(
                        chickenMultiplier(currentDifficulty, visualStep),
                      )
                    : "Départ"}
                </span>
              </strong>
              <span>
                <Users size={15} />{" "}
                {ghosts.length
                  ? `${ghosts.length} autre${ghosts.length > 1 ? "s" : ""} poulet${ghosts.length > 1 ? "s" : ""} sur la route`
                  : "La route est à vous pour l’instant"}
              </span>
              {active && !autoRunning && (
                <button type="button" onClick={advance} disabled={disabled}>
                  <ArrowRight size={15} /> Avancer
                </button>
              )}
            </div>
          </section>

          <GameControlsBar ariaLabel="Réglages de la partie">
            <GameControlGroup label="Difficulté">
              <div
                className="game-options is-compact"
                role="radiogroup"
                aria-label="Difficulté"
              >
                {CHICKEN_DIFFICULTY_ORDER.map((item) => (
                  <GameOption
                    key={item}
                    tone={item}
                    compact
                    selected={currentDifficulty === item}
                    disabled={active || autoRunning}
                    onClick={() => {
                      setDifficulty(item);
                      setSteps(
                        Math.min(steps, CHICKEN_MULTIPLIERS[item].length),
                      );
                    }}
                  >
                    <b>{CHICKEN_DIFFICULTIES[item].label}</b>
                    <small>{CHICKEN_MULTIPLIERS[item].length} voies</small>
                  </GameOption>
                ))}
              </div>
            </GameControlGroup>
            <GameControlGroup
              label={
                <>
                  Jetons{" "}
                  <span className="game-bet-amount">
                    {money(active && run ? run.bet : bet)}
                  </span>
                </>
              }
            >
              <BetChipPicker
                bet={active && run ? run.bet : bet}
                maxBet={maxBet}
                balance={balance}
                disabled={active || autoRunning}
                onSelect={selectChip}
              />
            </GameControlGroup>
            {autoRunning ? (
              <GameActionButton
                variant="stop"
                busy={game.pending}
                disabled={disabled}
                icon={<Square size={18} />}
                label="Arrêter l’auto"
                subline="Finir la série"
                onClick={() => void game.chickenCommand({ type: "auto:stop" })}
              />
            ) : active ? (
              <GameActionButton
                variant="cashout"
                busy={game.pending}
                disabled={disabled || currentStep < 1}
                icon={<Wallet size={20} />}
                label="Encaisser"
                subline={
                  currentStep
                    ? money(chickenPayout(run.bet, run.difficulty, currentStep))
                    : "Après un saut sûr"
                }
                onClick={cashout}
              />
            ) : (
              <GameActionButton
                variant="start"
                busy={game.pending}
                disabled={
                  disabled ||
                  !chickenBet(bet) ||
                  bet > balance ||
                  (mode === "auto" && !validAuto)
                }
                icon={<Play size={20} />}
                label={mode === "auto" ? "Lancer la série" : "Miser et partir"}
                subline={`${money(bet)} · ${CHICKEN_DIFFICULTIES[difficulty].label}`}
                onClick={start}
              />
            )}
            <div
              ref={autoControlRef}
              className={`game-auto-control ${styles.autoControl} ${autoOpen ? styles.autoOpen : ""} ${mode === "auto" || autoRunning ? styles.autoSelected : ""}`}
            >
              <button
                type="button"
                className={`game-auto-trigger ${styles.autoTrigger}`}
                aria-haspopup="dialog"
                aria-expanded={autoOpen}
                aria-controls="chicken-auto-popover"
                onClick={() => setAutoOpen((current) => !current)}
              >
                <span className={styles.autoTriggerIcon} aria-hidden="true">
                  {autoRunning ? (
                    <Square size={14} fill="currentColor" />
                  ) : (
                    <Repeat2 size={15} />
                  )}
                </span>
                <span
                  className={`game-auto-trigger-copy ${styles.autoTriggerCopy}`}
                >
                  <b>Auto</b>
                  <small>
                    {autoRunning
                      ? "En cours"
                      : mode === "auto"
                        ? "Activé"
                        : "À configurer"}
                  </small>
                </span>
                <ChevronDown
                  size={14}
                  className={styles.autoTriggerChevron}
                  aria-hidden="true"
                />
              </button>
              <GamePopoverPortal
                anchorRef={autoControlRef}
                panelRef={autoPopoverRef}
                open={autoOpen}
                id="chicken-auto-popover"
                className={styles.autoPopover}
                contextClassName={styles.autoControl}
                panelLabel="Réglages du mode automatique"
              >
                <div className={styles.autoPopoverHeading}>
                  <div>
                    <span className={styles.autoKicker}>MODE AUTOMATIQUE</span>
                    <strong>Régler la série</strong>
                  </div>
                  <button
                    type="button"
                    className={styles.autoClose}
                    aria-label="Fermer les réglages automatiques"
                    onClick={() => setAutoOpen(false)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <p className={styles.autoIntro}>
                  Choisissez le nombre de sauts et les limites de la série.
                </p>
                <div className={styles.autoSettings}>
                  <AutoField
                    label="Sauts par partie"
                    value={steps}
                    min={1}
                    max={CHICKEN_MULTIPLIERS[difficulty].length}
                    disabled={active || autoRunning}
                    onChange={setSteps}
                  />
                  <AutoField
                    label="Parties"
                    value={rounds}
                    min={1}
                    max={1000}
                    disabled={active || autoRunning}
                    onChange={setRounds}
                  />
                  <AutoField
                    label="Arrêt gain net"
                    value={stopProfit}
                    min={0}
                    disabled={active || autoRunning}
                    onChange={setStopProfit}
                  />
                  <AutoField
                    label="Arrêt perte nette"
                    value={stopLoss}
                    min={0}
                    disabled={active || autoRunning}
                    onChange={setStopLoss}
                  />
                  <AutoField
                    label="Après gain %"
                    value={onWinPercent}
                    min={-100}
                    max={500}
                    disabled={active || autoRunning}
                    onChange={setOnWinPercent}
                  />
                  <AutoField
                    label="Après perte %"
                    value={onLossPercent}
                    min={-100}
                    max={500}
                    disabled={active || autoRunning}
                    onChange={setOnLossPercent}
                  />
                </div>
                {autoRunning && (
                  <p className={styles.autoProgress} aria-live="polite">
                    {state?.auto?.played ?? 0}/{state?.auto?.rounds ?? rounds}{" "}
                    parties · bilan {money(state?.auto?.net ?? 0)}
                  </p>
                )}
                <button
                  type="button"
                  className={styles.autoModeButton}
                  disabled={active || autoRunning}
                  aria-pressed={mode === "auto"}
                  onClick={() =>
                    setMode((current) =>
                      current === "auto" ? "manual" : "auto",
                    )
                  }
                >
                  {mode === "auto"
                    ? "Revenir au mode manuel"
                    : "Activer le mode auto"}
                </button>
              </GamePopoverPortal>
            </div>
          </GameControlsBar>
        </main>
      </div>
      {game.error && (
        <div className="toast error-toast is-visible" role="alert">
          <X size={16} />
          <span>{game.error}</span>
          <button aria-label="Fermer" onClick={() => game.setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function AutoField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.autoField}>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

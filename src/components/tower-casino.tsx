"use client";

import {
  ArrowUp,
  Castle,
  CircleHelp,
  Crown,
  Skull,
  Sparkles,
  Users,
  Volume2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { credits } from "@/lib/rules";
import {
  formatMultiplier,
  TOWER_DIFFICULTIES,
  TOWER_DIFFICULTY_ORDER,
  TOWER_FLOORS,
  TOWER_GOLD_FIRST_FLOOR,
  TOWER_GOLD_LAST_FLOOR,
  TOWER_LUCKY_SHARE,
  TOWER_MAX_BET,
  TOWER_MIN_BET,
  towerHeat,
  towerMultiplier,
  towerPayout,
} from "@/lib/tower";
import { playCasinoSound, preloadCasinoSounds } from "@/lib/casino-audio";
import {
  playTowerCashout,
  playTowerCollapse,
  playTowerJackpot,
  playTowerLucky,
  playTowerStart,
  playTowerStep,
  preloadTowerSounds,
} from "@/lib/tower-audio";
import type {
  TowerCell,
  TowerDifficulty,
  TowerGhost,
  TowerRun,
} from "@/lib/types";
import { useGame } from "@/lib/use-game";
import type { CasinoView } from "./casino";
import { CasinoRail, ClubHeader, getClubBalance } from "./poker-casino";
import { TowerFx, type TowerFxHandle } from "./tower-fx";
import {
  BetChipPicker,
  GameActionButton,
  GameControlGroup,
  GameControlsBar,
  GameOption,
} from "./game-controls";
import styles from "./tower.module.css";

type Game = ReturnType<typeof useGame>;
type Navigate = (view: CasinoView) => void;
type Phase =
  | "idle"
  | "shaking"
  | "falling"
  | "rubble"
  | "climbing"
  | "celebrating"
  | "done";

const SHAKE_MS = 750;
const FALL_MS = 1_300;
const CELEBRATE_MS = 2_600;
/** Pace of the golden ride from the golden card to the top. */
const LUCKY_STEP_MS = 280;
const LUCKY_INTRO_MS = 1_900;
const MAX_CLIMBERS_SHOWN = 3;

/** Stable pseudo-random value in [0, 1) so debris never jumps between renders. */
function jitter(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

export function TowerCasino({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: Navigate;
}) {
  const tower = game.towerState;
  const run = tower?.run ?? null;
  const playing = run?.status === "playing";
  const balance = game.balance ?? 0;
  const { enterTower, leaveTower } = game;

  const [difficulty, setDifficulty] = useState<TowerDifficulty>("normal");
  const [bet, setBet] = useState(25);
  const [betSteps, setBetSteps] = useState<number[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [luckyIntro, setLuckyIntro] = useState(false);
  /** Floor shown while a Lucky Tower rides to the top, for the show only. */
  const [climb, setClimb] = useState<number | null>(null);
  const [pendingPick, setPendingPick] = useState<number | null>(null);
  const [sound, setSound] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [metrics, setMetrics] = useState({ view: 0, tower: 0, pitch: 0 });
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);
  soundRef.current = sound;
  const timers = useRef<number[]>([]);
  const previousRun = useRef<TowerRun | null>(null);
  const initialized = useRef(false);
  const fxRef = useRef<TowerFxHandle>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const towerRef = useRef<HTMLDivElement>(null);
  const floorsRef = useRef<HTMLDivElement>(null);
  const shockRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  const play = useCallback(
    (effect: Parameters<typeof playCasinoSound>[1], count = 1) => {
      if (soundRef.current && audioRef.current)
        playCasinoSound(audioRef.current, effect, count);
    },
    [],
  );
  const sfx = useCallback((sound: (context: AudioContext) => void) => {
    if (soundRef.current && audioRef.current) sound(audioRef.current);
  }, []);
  const ascend = useCallback((floor: number, card: DOMRect | undefined) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const strength = floor / TOWER_FLOORS;
    towerRef.current?.animate(
      [
        { transform: "scale(1)" },
        { transform: `scale(${1.02 + strength * 0.05})`, offset: 0.22 },
        { transform: "scale(1)" },
      ],
      { duration: 380 + floor * 30, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
    viewportRef.current?.animate(
      [
        { transform: "translateY(0)" },
        { transform: `translateY(${2 + floor * 0.7}px)`, offset: 0.12 },
        { transform: "translateY(0)" },
      ],
      { duration: 260 + floor * 12, easing: "ease-out" },
    );
    flashRef.current?.animate(
      [{ opacity: 0.25 + strength * 0.6 }, { opacity: 0 }],
      { duration: 500 + floor * 40, easing: "ease-out" },
    );
    const shock = shockRef.current;
    const stage = shock?.parentElement?.getBoundingClientRect();
    if (shock && stage && card) {
      shock.style.left = `${card.left + card.width / 2 - stage.left}px`;
      shock.style.top = `${card.top + card.height / 2 - stage.top}px`;
      shock.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.2)", opacity: 0.95 },
          {
            transform: `translate(-50%, -50%) scale(${2.4 + floor * 0.35})`,
            opacity: 0,
          },
        ],
        {
          duration: 620 + floor * 30,
          easing: "cubic-bezier(0.1, 0.7, 0.3, 1)",
        },
      );
    }
  }, []);
  const later = useCallback((delay: number, callback: () => void) => {
    timers.current.push(window.setTimeout(callback, delay));
  }, []);
  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // Being on this screen is being in a Tower room. Leaving it settles the
  // climb on the server, so no run stays open while playing another game.
  useEffect(() => {
    enterTower();
    return leaveTower;
  }, [enterTower, leaveTower]);

  // Turn server transitions into animation phases.
  useEffect(() => {
    if (!tower) return;
    const previous = previousRun.current;
    previousRun.current = run;
    if (!initialized.current) {
      // A climb restored after a reload is shown as it ended, without replaying effects.
      initialized.current = true;
      if (run?.status === "lost") setPhase("rubble");
      else if (run && run.status !== "playing") setPhase("done");
      if (run?.lucky) setClimb(TOWER_FLOORS);
      return;
    }
    if (!run) return;
    if (!previous || previous.id !== run.id) {
      clearTimers();
      setPreviewing(false);
      setPhase("idle");
      setClimb(null);
      setDifficulty(run.difficulty);
      play("chips");
      sfx(playTowerStart);
      return;
    }
    if (run.floor > previous.floor) {
      sfx((context) => playTowerStep(context, run.floor));
      const card = floorsRef.current?.querySelector(
        `[data-row="${run.floor - 1}"] [data-picked]`,
      );
      const rect = card?.getBoundingClientRect();
      if (rect) fxRef.current?.pop(rect.left + rect.width / 2, rect.top);
      ascend(run.floor, rect);
    }
    if (previous.status !== "playing" || run.status === "playing") return;
    clearTimers();
    if (run.status === "lost") {
      play("card");
      sfx((context) => playTowerCollapse(context, SHAKE_MS));
      setPhase("shaking");
      later(SHAKE_MS, () => {
        setPhase("falling");
        fxRef.current?.collapse();
      });
      later(SHAKE_MS + FALL_MS, () => setPhase("rubble"));
    } else if (run.lucky) {
      // The golden card: the tower lights up floor by floor to the top, then
      // the celebration plays. The payout itself is already settled.
      sfx(playTowerLucky);
      setLuckyIntro(true);
      setPhase("climbing");
      setClimb(run.floor);
      later(LUCKY_INTRO_MS, () => setLuckyIntro(false));
      let delay = LUCKY_INTRO_MS;
      for (let next = run.floor + 1; next <= TOWER_FLOORS; next++) {
        later(delay, () => {
          setClimb(next);
          sfx((context) => playTowerStep(context, next));
          const card = floorsRef.current?.querySelector(
            `[data-row="${next - 1}"] button`,
          );
          ascend(next, card?.getBoundingClientRect());
        });
        delay += LUCKY_STEP_MS;
      }
      later(delay, () => {
        play("chips", 2);
        sfx(playTowerJackpot);
        fxRef.current?.burst("jackpot");
        fxRef.current?.fireworks(1);
        setPhase("celebrating");
      });
      later(delay + CELEBRATE_MS, () => setPhase("done"));
    } else {
      later(120, () => play("chips", 2));
      const bigWin = run.status === "topped";
      sfx((context) =>
        bigWin
          ? playTowerJackpot(context)
          : playTowerCashout(context, run.floor),
      );
      fxRef.current?.burst(bigWin ? "jackpot" : "win");
      // Fireworks for a win at the top, or for cashing out from floor 6 upwards.
      if (bigWin) fxRef.current?.fireworks(1);
      else if (run.floor >= 6)
        fxRef.current?.fireworks(0.35 + (run.floor - 6) * 0.15);
      setPhase("celebrating");
      later(CELEBRATE_MS, () => setPhase("done"));
    }
  }, [tower, run, play, sfx, ascend, later, clearTimers]);

  // Measure the stage so the camera can follow the climb when the tower does not fit.
  useLayoutEffect(() => {
    const measure = () => {
      const view = viewportRef.current?.clientHeight ?? 0;
      const towerHeight = towerRef.current?.offsetHeight ?? 0;
      const pitch = (floorsRef.current?.offsetHeight ?? 0) / TOWER_FLOORS;
      setMetrics((current) =>
        current.view === view &&
        current.tower === towerHeight &&
        current.pitch === pitch
          ? current
          : { view, tower: towerHeight, pitch },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (towerRef.current) observer.observe(towerRef.current);
    return () => observer.disconnect();
    // The tower remounts for each climb and each previewed difficulty.
  }, [run?.id, difficulty]);

  const activeDifficulty = playing && run ? run.difficulty : difficulty;
  const shownRun = run && (playing || !previewing) ? run : null;
  const maxBet = Math.min(TOWER_MAX_BET, Math.floor(balance));
  const busy = game.pending || pendingPick !== null;
  const animating =
    phase === "shaking" ||
    phase === "falling" ||
    phase === "climbing" ||
    luckyIntro;
  const collapsed =
    shownRun?.status === "lost" && (phase === "falling" || phase === "rubble");

  const addChip = (amount: number) => {
    if (playing || bet + amount > maxBet) return;
    setBet(bet + amount);
    setBetSteps([...betSteps, amount]);
    setPreviewing(true);
    play("chips");
  };
  const undoChip = () => {
    const last = betSteps.at(-1);
    if (last === undefined || playing) return;
    setBet(Math.max(0, bet - last));
    setBetSteps(betSteps.slice(0, -1));
  };
  const clearBet = () => {
    if (playing) return;
    setBet(0);
    setBetSteps([]);
  };
  const start = () => {
    if (busy || playing || bet < TOWER_MIN_BET || bet > balance) return;
    void game.towerCommand({ type: "start", difficulty, bet });
  };
  const pick = async (column: number) => {
    if (!playing || busy || animating || !run || column >= run.cols) return;
    setPendingPick(column);
    await game.towerCommand({ type: "pick", column });
    setPendingPick(null);
  };
  const cashout = () => {
    if (!playing || !run || run.floor < 1 || busy) return;
    void game.towerCommand({ type: "cashout" });
  };

  const keyboard = useRef({ pick, cashout, start });
  keyboard.current = { pick, cashout, start };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key >= "1" && event.key <= "5")
        void keyboard.current.pick(Number(event.key) - 1);
      else if (event.key === "Enter" && !target?.closest("button")) {
        if (playing) keyboard.current.cashout();
        else keyboard.current.start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  const riding = shownRun?.lucky && climb !== null;
  const floor = riding ? climb : (shownRun?.floor ?? 0);
  const status = shownRun?.status ?? "idle";
  const golden =
    Boolean(shownRun?.lucky) ||
    ((status === "cashed" || status === "topped") && phase !== "idle");
  const heat = status === "lost" ? 0 : towerHeat(floor);

  // Ascension: the tower grows and the violet brightens with every floor.
  const ascent = collapsed ? 0 : floor / TOWER_FLOORS;
  const growth = 1 + ascent * 0.28;

  // Camera: keep the floor being played in the lower half of the stage.
  const overflow = Math.max(0, metrics.tower * growth - metrics.view);
  const focusFloor = collapsed ? 0 : Math.min(floor, TOWER_FLOORS - 1);
  const shift = Math.round(
    Math.max(
      0,
      Math.min(
        overflow,
        (focusFloor + 0.5) * metrics.pitch * growth + 40 - metrics.view * 0.55,
      ),
    ),
  );

  const ghosts = (tower?.ghosts ?? []).filter(
    (ghost) => ghost.playerId !== game.playerId,
  );

  return (
    <div className="casino-shell tower-shell">
      <CasinoRail active="tower" onNavigate={onNavigate} />
      <div className="workspace">
        <ClubHeader
          balance={getClubBalance(game)}
          name={game.profile?.name ?? ""}
        />
        <main className={styles.page}>
          <header className={styles.strip}>
            <div className={styles.titleBlock}>
              <span className="eyebrow">LE CLUB / JEU SOLO & LIVE</span>
              <h1>
                La <em>Tower</em>
              </h1>
            </div>
            <LuckyBadge
              hot={Boolean(shownRun?.lucky)}
              pot={tower?.luckyPot ?? 0}
            />
            <div className={styles.stripTools}>
              <span
                className={styles.liveCount}
                title="Joueurs en train de grimper"
              >
                <Users size={15} />
                {ghosts.filter((ghost) => ghost.status === "playing").length}
              </span>
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
              <button
                type="button"
                className="poker-sound"
                aria-label="Règles de la Tower"
                aria-expanded={rulesOpen}
                onClick={() => setRulesOpen(!rulesOpen)}
              >
                <CircleHelp size={15} />
              </button>
            </div>
          </header>

          {rulesOpen && <TowerRules onClose={() => setRulesOpen(false)} />}

          <section
            className={styles.stage}
            data-phase={phase}
            data-status={status}
            data-golden={golden || undefined}
            data-lucky={shownRun?.lucky || undefined}
            style={{ "--heat": heat, "--ascent": ascent } as CSSProperties}
            aria-label="La tour"
          >
            <div className={styles.skyGlow} aria-hidden="true" />
            <div className={styles.ascentLight} aria-hidden="true" />
            <TowerFx
              ref={fxRef}
              targetRef={floorsRef}
              heat={collapsed ? 0 : heat}
              golden={golden}
              className={styles.fx}
            />
            <div className={styles.viewport} ref={viewportRef}>
              <div
                className={styles.camera}
                style={{ transform: `translateY(${shift}px)` }}
              >
                <div
                  className={styles.grow}
                  style={{ transform: `scale(${growth})` }}
                >
                  <TowerView
                    key={shownRun?.id ?? `preview-${difficulty}`}
                    run={riding ? { ...shownRun!, floor } : shownRun}
                    cols={shownRun?.cols ?? TOWER_DIFFICULTIES[difficulty].cols}
                    difficulty={shownRun?.difficulty ?? difficulty}
                    phase={phase}
                    pendingPick={pendingPick}
                    canPick={Boolean(playing) && !busy && !animating}
                    onPick={pick}
                    ghosts={ghosts}
                    me={game.profile?.name ?? ""}
                    towerRef={towerRef}
                    floorsRef={floorsRef}
                  />
                </div>
              </div>
              {shownRun?.status === "lost" && phase !== "shaking" && (
                <Rubble cols={shownRun.cols} />
              )}
            </div>
            <div className={styles.vignette} aria-hidden="true" />
            <div
              className={styles.ascentFlash}
              ref={flashRef}
              aria-hidden="true"
            />
            <div className={styles.shock} ref={shockRef} aria-hidden="true" />
            {luckyIntro && <LuckyBanner />}
            {shownRun &&
              shownRun.status !== "playing" &&
              phase !== "idle" &&
              phase !== "shaking" &&
              phase !== "climbing" && (
                <ResultBanner
                  run={shownRun}
                  celebrating={phase === "celebrating"}
                />
              )}
            {!shownRun && (
              <div className={styles.idleHint}>
                <Castle size={16} />
                Choisissez une difficulté, misez, puis grimpez.
              </div>
            )}
          </section>

          <GameControlsBar ariaLabel="Réglages de la partie">
            <GameControlGroup label="Difficulté">
              <div className="game-options" role="radiogroup">
                {TOWER_DIFFICULTY_ORDER.map((key) => {
                  const cols = TOWER_DIFFICULTIES[key].cols;
                  return (
                    <GameOption
                      key={key}
                      tone={key}
                      selected={activeDifficulty === key}
                      disabled={playing}
                      onClick={() => {
                        setDifficulty(key);
                        setPreviewing(true);
                      }}
                    >
                      <b>{TOWER_DIFFICULTIES[key].label}</b>
                      <small>
                        {cols} cartes ·{" "}
                        {formatMultiplier(towerMultiplier(key, TOWER_FLOORS))}
                      </small>
                    </GameOption>
                  );
                })}
              </div>
            </GameControlGroup>

            <GameControlGroup
              label={
                <>
                  Mise{" "}
                  <b className="game-bet-amount">
                    {credits(playing && run ? run.bet : bet)} cr.
                  </b>
                </>
              }
            >
              <BetChipPicker
                bet={bet}
                maxBet={maxBet}
                betSteps={betSteps}
                disabled={playing}
                onAdd={addChip}
                onUndo={undoChip}
                onClear={clearBet}
              />
            </GameControlGroup>

            <ActionButton
              run={run}
              playing={Boolean(playing)}
              busy={busy}
              bet={bet}
              balance={balance}
              difficulty={difficulty}
              onStart={start}
              onCashout={cashout}
            />
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

function ActionButton({
  run,
  playing,
  busy,
  bet,
  balance,
  difficulty,
  onStart,
  onCashout,
}: {
  run: TowerRun | null;
  playing: boolean;
  busy: boolean;
  bet: number;
  balance: number;
  difficulty: TowerDifficulty;
  onStart: () => void;
  onCashout: () => void;
}) {
  if (playing && run) {
    const current = towerPayout(run.bet, run.difficulty, run.floor);
    const next =
      run.floor < TOWER_FLOORS
        ? towerPayout(run.bet, run.difficulty, run.floor + 1)
        : null;
    return (
      <GameActionButton
        variant="cashout"
        busy={busy}
        disabled={busy || run.floor < 1}
        icon={<Crown size={18} />}
        label={
          run.floor < 1
            ? "Choisissez une carte"
            : `Encaisser ${credits(current)} cr.`
        }
        subline={
          next !== null && (
            <>
              Étage suivant :{" "}
              {formatMultiplier(towerMultiplier(run.difficulty, run.floor + 1))}{" "}
              · {credits(next)} cr.
            </>
          )
        }
        onClick={onCashout}
      />
    );
  }
  const reason =
    bet < TOWER_MIN_BET
      ? `Mise minimale : ${TOWER_MIN_BET} cr.`
      : balance < bet
        ? "Solde insuffisant"
        : `${TOWER_DIFFICULTIES[difficulty].label} · jusqu’à ${credits(towerPayout(bet, difficulty, TOWER_FLOORS))} cr.`;
  return (
    <GameActionButton
      variant="start"
      busy={busy}
      disabled={busy || bet < TOWER_MIN_BET || balance < bet}
      icon={<ArrowUp size={18} />}
      label={`${run ? "Rejouer" : "Jouer"} · ${credits(bet)} cr.`}
      subline={reason}
      onClick={onStart}
    />
  );
}

function TowerView({
  run,
  cols,
  difficulty,
  phase,
  pendingPick,
  canPick,
  onPick,
  ghosts,
  me,
  towerRef,
  floorsRef,
}: {
  run: TowerRun | null;
  cols: number;
  difficulty: TowerDifficulty;
  phase: Phase;
  pendingPick: number | null;
  canPick: boolean;
  onPick: (column: number) => void;
  ghosts: TowerGhost[];
  me: string;
  towerRef: RefObject<HTMLDivElement | null>;
  floorsRef: RefObject<HTMLDivElement | null>;
}) {
  const floor = run?.floor ?? 0;
  const lostFloor = run?.status === "lost" ? floor : -1;
  // With two cards, the other card of a cleared floor is necessarily the trap.
  const revealWholeRow = cols === 2;
  const climbers = new Map<number, TowerGhost[]>();
  for (const ghost of ghosts) {
    const row = Math.min(ghost.floor, TOWER_FLOORS - 1);
    climbers.set(row, [...(climbers.get(row) ?? []), ghost]);
  }
  return (
    <div
      className={styles.tower}
      ref={towerRef}
      data-collapsed={
        (run?.status === "lost" &&
          (phase === "falling" || phase === "rubble")) ||
        undefined
      }
      style={{ "--cols": cols } as CSSProperties}
    >
      <div className={styles.crown} aria-hidden="true">
        <Crown size={26} />
      </div>
      <div className={styles.floors} ref={floorsRef}>
        {Array.from({ length: TOWER_FLOORS }, (_, rowIndex) => {
          const row = run?.rows[rowIndex];
          const active = run?.status === "playing" && rowIndex === floor;
          const cleared = Boolean(run) && rowIndex < floor;
          const others = climbers.get(rowIndex) ?? [];
          return (
            <div
              key={rowIndex}
              className={styles.floor}
              data-row={rowIndex}
              data-active={active || undefined}
              data-cleared={cleared || undefined}
              data-lost={rowIndex === lostFloor || undefined}
              role={active ? "group" : undefined}
              aria-label={
                active
                  ? `Étage ${rowIndex + 1} : choisissez une carte`
                  : undefined
              }
              style={
                {
                  "--row": rowIndex,
                  "--dx": `${(jitter(rowIndex, 1) - 0.5) * 320}px`,
                  "--rot": `${(jitter(rowIndex, 2) - 0.5) * 60}deg`,
                  "--fall-delay": `${(TOWER_FLOORS - 1 - rowIndex) * 40}ms`,
                } as CSSProperties
              }
            >
              <span className={styles.climbers}>
                {others.slice(0, MAX_CLIMBERS_SHOWN).map((ghost) => (
                  <i
                    key={ghost.id}
                    className={styles.climber}
                    data-status={ghost.status}
                    data-lucky={ghost.lucky || undefined}
                    title={`${ghost.name} · étage ${ghost.floor}`}
                  >
                    {ghost.name.slice(0, 1).toUpperCase()}
                  </i>
                ))}
                {others.length > MAX_CLIMBERS_SHOWN && (
                  <i className={styles.climber} data-more>
                    +{others.length - MAX_CLIMBERS_SHOWN}
                  </i>
                )}
                {active && (
                  <i className={styles.climber} data-me title="Vous">
                    {me.slice(0, 1).toUpperCase()}
                  </i>
                )}
              </span>
              <span className={styles.floorNumber}>{rowIndex + 1}</span>
              <div className={styles.cells}>
                {Array.from({ length: cols }, (_, column) => {
                  const picked = row?.picked === column;
                  const visible =
                    Boolean(row?.cells) &&
                    (picked ||
                      revealWholeRow ||
                      // A golden card shows once its row is behind the
                      // player, even when another card was chosen.
                      row?.cells?.[column] === "gold");
                  const cell: TowerCell | undefined = visible
                    ? row?.cells?.[column]
                    : undefined;
                  return (
                    <button
                      key={column}
                      type="button"
                      className={styles.card}
                      data-cell={cell}
                      data-picked={picked || undefined}
                      data-pending={
                        (active && pendingPick === column) || undefined
                      }
                      data-lucky={run?.lucky || undefined}
                      disabled={!active || !canPick}
                      tabIndex={active ? 0 : -1}
                      aria-label={
                        active
                          ? `Carte ${column + 1}`
                          : cell === "trap"
                            ? "Carte faillite"
                            : cell
                              ? "Carte étage supérieur"
                              : "Carte cachée"
                      }
                      style={
                        {
                          "--flip-delay": `${picked ? 0 : 200 + column * 60}ms`,
                        } as CSSProperties
                      }
                      onClick={() => onPick(column)}
                    >
                      <span className={styles.cardInner}>
                        <span className={styles.cardBack}>
                          {run?.lucky ? <Crown size={15} /> : <span>M</span>}
                        </span>
                        <span className={styles.cardFace}>
                          {cell === "trap" ? (
                            <Skull size={20} />
                          ) : cell === "gold" ? (
                            <Crown size={20} />
                          ) : (
                            <ArrowUp size={20} />
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <span className={styles.floorMultiplier}>
                {formatMultiplier(towerMultiplier(difficulty, rowIndex + 1))}
              </span>
            </div>
          );
        })}
      </div>
      <Cracks floor={lostFloor} />
      <div className={styles.plinth} aria-hidden="true" />
    </div>
  );
}

function Cracks({ floor }: { floor: number }) {
  if (floor < 0) return null;
  // Floors are drawn top to bottom in the SVG, from floor 10 down to floor 1.
  const y = ((TOWER_FLOORS - 1 - floor) / TOWER_FLOORS) * 100 + 5;
  const paths = [0, 1, 2, 3].map((branch) => {
    let x = 30 + jitter(floor, branch + 20) * 40;
    let currentY = y;
    const direction = branch % 2 ? 1 : -1;
    const points = [`${x},${currentY}`];
    for (let step = 0; step < 6; step++) {
      x += (jitter(step, branch + 30) - 0.5) * 22;
      currentY += direction * (5 + jitter(step, branch + 40) * 9);
      points.push(`${x.toFixed(1)},${currentY.toFixed(1)}`);
    }
    return points.join(" ");
  });
  return (
    <svg
      className={styles.cracks}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {paths.map((points, index) => (
        <polyline
          key={index}
          points={points}
          pathLength={100}
          style={{ "--delay": `${index * 90}ms` } as CSSProperties}
        />
      ))}
    </svg>
  );
}

/** What is left of the tower: a heap of slabs and cards at the foot of the stage. */
function Rubble({ cols }: { cols: number }) {
  const width = 150 + cols * 34;
  const pieces = Array.from({ length: 46 }, (_, index) => {
    // Two averaged randoms bias positions toward the center, so the pieces form a mound.
    const spread = (jitter(index, 50) + jitter(index, 51) - 1) * width;
    const mound = 1 - Math.min(1, Math.abs(spread) / (width + 20));
    const card = index % 4 === 0;
    return {
      card,
      x: spread,
      y: mound * (14 + jitter(index, 52) * 56),
      width: card ? 30 : 26 + jitter(index, 53) * 60,
      height: card ? 21 : 12 + jitter(index, 54) * 14,
      rotate: (jitter(index, 55) - 0.5) * (card ? 120 : 70),
      delay: 80 + jitter(index, 56) * 600 + (1 - mound) * 150,
      z: Math.round(mound * 10),
    };
  });
  return (
    <div className={styles.rubble} aria-hidden="true">
      {pieces.map((piece, index) => (
        <i
          key={index}
          data-card={piece.card || undefined}
          style={
            {
              "--x": `${piece.x}px`,
              "--y": `${piece.y}px`,
              "--w": `${piece.width}px`,
              "--h": `${piece.height}px`,
              "--r": `${piece.rotate}deg`,
              "--delay": `${piece.delay}ms`,
              zIndex: piece.z,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function LuckyBadge({ hot, pot }: { hot: boolean; pot: number }) {
  return (
    <div
      className={styles.jackpot}
      data-hot={hot || undefined}
      title={`Carte dorée cachée entre les lignes ${TOWER_GOLD_FIRST_FLOOR} et ${TOWER_GOLD_LAST_FLOOR}`}
    >
      <Crown size={18} />
      <span>
        <small>Votre cagnotte Lucky</small>
        <b>{credits(pot)} cr.</b>
      </span>
    </div>
  );
}

function LuckyBanner() {
  return (
    <div className={styles.luckyBanner} role="status">
      <div className={styles.luckyRays} aria-hidden="true" />
      <Sparkles size={22} />
      <strong>LUCKY TOWER</strong>
      <span>Carte dorée · votre cagnotte Lucky est à vous</span>
    </div>
  );
}

function ResultBanner({
  run,
  celebrating,
}: {
  run: TowerRun;
  celebrating: boolean;
}) {
  const lost = run.status === "lost";
  return (
    <div
      className={styles.result}
      data-status={run.status}
      data-lucky={run.lucky || undefined}
      data-celebrating={celebrating || undefined}
      role="status"
    >
      {lost ? <Skull size={20} /> : <Crown size={20} />}
      <small>
        {lost
          ? `La tour s’effondre à l’étage ${run.floor + 1}`
          : run.lucky
            ? "Lucky Tower !"
            : run.status === "topped"
              ? "Sommet atteint !"
              : `Encaissé à l’étage ${run.floor}`}
      </small>
      <strong>
        {lost ? `−${credits(run.bet)}` : `+${credits(run.payout)}`} cr.
      </strong>
      {!lost && !run.lucky && run.floor > 0 && (
        <span>
          {formatMultiplier(towerMultiplier(run.difficulty, run.floor))}
        </span>
      )}
    </div>
  );
}

function TowerRules({ onClose }: { onClose: () => void }) {
  return (
    <section className={styles.rules} aria-label="Règles">
      <button
        type="button"
        className={styles.rulesClose}
        aria-label="Fermer les règles"
        onClick={onClose}
      >
        <X size={15} />
      </button>
      <h2>Comment jouer</h2>
      <ol>
        <li>
          Choisissez une difficulté : de 5 cartes par étage (Facile) à 2 cartes
          (Impossible). Il y a toujours un seul piège par étage.
        </li>
        <li>
          Misez de {TOWER_MIN_BET} à {TOWER_MAX_BET} crédits avec les jetons,
          puis cliquez sur Jouer. La mise est verrouillée.
        </li>
        <li>
          À chaque étage, retournez une carte. Flèche : vous montez. Crâne : la
          tour s’effondre et la mise est perdue.
        </li>
        <li>
          Après chaque étage réussi, encaissez mise × multiplicateur, ou tentez
          l’étage suivant. Le 10ᵉ étage est encaissé automatiquement.
        </li>
        <li>
          Certaines ascensions cachent une <b>carte dorée</b>, jamais à la place
          du piège, entre les lignes {TOWER_GOLD_FIRST_FLOOR} et{" "}
          {TOWER_GOLD_LAST_FLOOR}. La retourner déclenche la <b>Lucky Tower</b>{" "}
          : l’étage atteint est encaissé et votre cagnotte Lucky vous est
          versée. Chacune de vos mises y ajoute{" "}
          {Math.round(TOWER_LUCKY_SHARE * 100)} %.
        </li>
        <li>
          Quitter la Tower règle l’ascension en cours : les gains acquis sont
          encaissés, la mise est rendue si aucun étage n’a été franchi.
        </li>
      </ol>
      <p>
        Les cercles à gauche des étages montrent où en sont les joueurs de votre
        salle. Raccourcis : touches 1 à 5 pour choisir une carte, Entrée pour
        encaisser.
      </p>
    </section>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Check,
  Coins,
  Diamond,
  Play,
  RotateCcw,
  Sparkles,
  Spade,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { Card } from "@/lib/types";
import { credits } from "@/lib/rules";
import { SettlementChipAnimation } from "../ui/table-chips";
import { PlayingCard } from "../ui/playing-card";
import { PokerChipStack } from "../games/poker/poker-casino";
import { PokerShuffleAnimation } from "../ui/poker-shuffle";
import styles from "./animation-lab.module.css";

type Section = "blackjack" | "poker" | "interface";
type HandResult = "win" | "lose" | "push" | "blackjack";
type LabSound = "card" | "chips" | "win" | "loss" | "shuffle" | "ui";
type SoundPlayer = (sound: LabSound) => void;

const LabAudioContext = createContext<SoundPlayer>(() => undefined);

const labSoundFiles: Record<Exclude<LabSound, "ui">, string[]> = {
  card: [
    "/audio/poker/deal-1.mp3",
    "/audio/poker/deal-2.mp3",
    "/audio/poker/deal-3.mp3",
    "/audio/poker/deal-4.mp3",
  ],
  chips: [
    "/audio/poker/chips-1.mp3",
    "/audio/poker/chips-2.mp3",
    "/audio/poker/chips-3.mp3",
  ],
  win: ["/audio/poker/chips-3.mp3", "/audio/poker/chips-2.mp3"],
  loss: ["/audio/poker/fold-1.mp3", "/audio/poker/fold-2.mp3"],
  shuffle: ["/audio/poker/card-shuffle-pro.mp3"],
};

function useLabAudio() {
  const [enabled, setEnabled] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const playingRef = useRef(new Set<HTMLAudioElement>());

  const getContext = useCallback(() => {
    if (!contextRef.current) contextRef.current = new AudioContext();
    return contextRef.current;
  }, []);

  useEffect(
    () => () => {
      for (const audio of playingRef.current) audio.pause();
      playingRef.current.clear();
      if (contextRef.current) void contextRef.current.close();
    },
    [],
  );

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      if (next) void getContext().resume();
      return next;
    });
  }, [getContext]);

  const play = useCallback<SoundPlayer>(
    (sound) => {
      if (!enabled) return;

      if (sound === "ui") {
        const context = getContext();
        void context.resume().then(() => {
          if (context.state === "closed") return;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const startsAt = context.currentTime;
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(360, startsAt);
          oscillator.frequency.exponentialRampToValueAtTime(
            240,
            startsAt + 0.055,
          );
          gain.gain.setValueAtTime(0.035, startsAt);
          gain.gain.exponentialRampToValueAtTime(0.001, startsAt + 0.055);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startsAt);
          oscillator.stop(startsAt + 0.055);
        });
        return;
      }

      const files = labSoundFiles[sound];
      const path = files[Math.floor(Math.random() * files.length)];
      const audio = new Audio(path);
      audio.volume = sound === "chips" || sound === "win" ? 0.48 : 0.56;
      playingRef.current.add(audio);
      const release = () => playingRef.current.delete(audio);
      audio.addEventListener("ended", release, { once: true });
      audio.addEventListener("error", release, { once: true });
      void audio.play().catch(release);
    },
    [enabled, getContext],
  );

  return { enabled, toggle, play };
}

const cards = {
  aceSpades: { id: "as", rank: 1, suit: "spades" },
  kingHearts: { id: "kh", rank: 13, suit: "hearts" },
  queenDiamonds: { id: "qd", rank: 12, suit: "diamonds" },
  jackClubs: { id: "jc", rank: 11, suit: "clubs" },
  tenSpades: { id: "10s", rank: 10, suit: "spades" },
  nineHearts: { id: "9h", rank: 9, suit: "hearts" },
  eightClubs: { id: "8c", rank: 8, suit: "clubs" },
  sevenDiamonds: { id: "7d", rank: 7, suit: "diamonds" },
} satisfies Record<string, Card>;

type ChipColumn = { denomination: 5 | 25 | 50 | 100; layers: number };

const chipStates: ReadonlyArray<{
  amount: number;
  columns: ReadonlyArray<ChipColumn>;
}> = [
  { amount: 5, columns: [{ denomination: 5, layers: 2 }] },
  { amount: 10, columns: [{ denomination: 5, layers: 3 }] },
  { amount: 25, columns: [{ denomination: 25, layers: 2 }] },
  {
    amount: 30,
    columns: [
      { denomination: 25, layers: 2 },
      { denomination: 5, layers: 2 },
    ],
  },
  { amount: 50, columns: [{ denomination: 50, layers: 2 }] },
  {
    amount: 75,
    columns: [
      { denomination: 50, layers: 2 },
      { denomination: 25, layers: 2 },
    ],
  },
  { amount: 100, columns: [{ denomination: 100, layers: 2 }] },
  {
    amount: 125,
    columns: [
      { denomination: 100, layers: 2 },
      { denomination: 25, layers: 2 },
    ],
  },
  {
    amount: 150,
    columns: [
      { denomination: 100, layers: 2 },
      { denomination: 50, layers: 2 },
    ],
  },
  {
    amount: 175,
    columns: [
      { denomination: 100, layers: 2 },
      { denomination: 50, layers: 2 },
      { denomination: 25, layers: 2 },
    ],
  },
  {
    amount: 250,
    columns: [
      { denomination: 100, layers: 3 },
      { denomination: 50, layers: 2 },
    ],
  },
  {
    amount: 500,
    columns: [
      { denomination: 100, layers: 5 },
      { denomination: 50, layers: 4 },
      { denomination: 25, layers: 3 },
    ],
  },
];

function Demo({
  title,
  note,
  children,
  className = "",
  sound = "ui",
}: {
  title: string;
  note: string;
  children: (run: number) => ReactNode;
  className?: string;
  sound?: LabSound;
}) {
  const [run, setRun] = useState(0);
  const playSound = useContext(LabAudioContext);

  return (
    <article className={`${styles.demo} ${className}`}>
      <header className={styles.demoHeader}>
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
        <button
          type="button"
          className={styles.replay}
          onClick={() => {
            playSound(sound);
            setRun((value) => value + 1);
          }}
        >
          <RotateCcw size={13} />
          Rejouer
        </button>
      </header>
      <div className={styles.stage} key={run}>
        {children(run)}
      </div>
    </article>
  );
}

function ResultDemo({ run }: { run: number }) {
  const [result, setResult] = useState<HandResult>("win");
  const labels: Record<HandResult, string> = {
    win: "+100",
    lose: "Perdu",
    push: "Égalité",
    blackjack: "+150",
  };

  return (
    <div className={styles.resultDemo}>
      <div className={styles.segmented}>
        {(["win", "lose", "push", "blackjack"] as HandResult[]).map((value) => (
          <button
            type="button"
            className={result === value ? styles.selected : ""}
            onClick={() => setResult(value)}
            key={value}
          >
            {value === "win"
              ? "Gain"
              : value === "lose"
                ? "Perte"
                : value === "push"
                  ? "Égalité"
                  : "Blackjack"}
          </button>
        ))}
      </div>
      <div
        className={`hand ${result === "win" || result === "blackjack" ? "winning-hand" : ""}`}
        key={`${run}-${result}`}
      >
        <div className="hand-cards">
          <PlayingCard card={cards.aceSpades} index={0} decorative />
          <PlayingCard card={cards.kingHearts} index={1} decorative />
        </div>
        <span
          className={`hand-score ${result === "blackjack" ? "natural" : ""}`}
        >
          {result === "blackjack" ? "BLACKJACK" : "21"}
          {result === "win" && <Check size={10} />}
        </span>
        <span className={`hand-result ${result}`}>{labels[result]}</span>
      </div>
    </div>
  );
}

function LabChipStack({
  amount,
  columns,
}: {
  amount: number;
  columns: ReadonlyArray<ChipColumn>;
}) {
  return (
    <span className="table-chip">
      <span className="table-chip-pile" aria-hidden="true">
        {columns.map((column, columnIndex) => (
          <span
            className={`table-chip-column chip-${column.denomination}`}
            key={`${column.denomination}-${columnIndex}`}
            style={
              {
                "--chip-column-left": `${((columnIndex + 1) / (columns.length + 1)) * 100}%`,
                "--chip-column-index": columnIndex,
              } as CSSProperties
            }
          >
            {Array.from({ length: column.layers }, (_, layer) => (
              <i
                className="table-chip-disc"
                key={layer}
                style={{ "--chip-layer": layer } as CSSProperties}
              />
            ))}
          </span>
        ))}
      </span>
      <span className="table-chip-amount">{credits(amount)}</span>
    </span>
  );
}

function ChipState({
  amount,
  columns,
}: {
  amount: number;
  columns: ReadonlyArray<ChipColumn>;
}) {
  const [run, setRun] = useState(0);
  const playSound = useContext(LabAudioContext);
  return (
    <button
      type="button"
      className={styles.chipState}
      onClick={() => {
        playSound("chips");
        setRun((value) => value + 1);
      }}
      aria-label={`Rejouer la pile de ${amount} crédits`}
    >
      <span key={run}>
        <LabChipStack amount={amount} columns={columns} />
      </span>
      <small>{columns.map((column) => column.denomination).join(" + ")}</small>
    </button>
  );
}

function ChipStackDemo() {
  return (
    <div className={styles.chipMatrix}>
      {chipStates.map((state) => (
        <ChipState {...state} key={state.amount} />
      ))}
    </div>
  );
}

function SettlementDemo({
  kind,
  payout,
}: {
  kind: "main" | "side";
  payout: number;
}) {
  const side = kind === "side";
  const stake = 25;
  return (
    <div className={`table-stage ${styles.settlementTable}`}>
      <div className={`dealer-cards ${styles.settlementBank}`}>
        <Coins size={18} />
        <span>BANQUE</span>
      </div>
      <div className={`seat ${styles.settlementSeat}`}>
        <div className="table-bet-zones">
          <button
            type="button"
            className={`table-bet-spot ${side ? "spot-three" : "spot-main"} has-chips`}
            disabled
          >
            <span className="spot-label">{side ? "21 + 3" : "BLACKJACK"}</span>
            <SettlementChipAnimation
              stake={stake}
              payout={payout}
              maximum={side ? 100 : 500}
              side={side}
            />
          </button>
        </div>
        <button type="button" className="seat-name" disabled>
          <span className="avatar tiny">J</span>
          <span>Joueur</span>
        </button>
      </div>
      <p className={styles.settlementCaption}>
        {payout > stake
          ? `${credits(payout - stake)} gagnés · ${credits(payout)} rendus`
          : payout === stake
            ? `${credits(stake)} rendus`
            : `${credits(stake)} collectés`}
      </p>
    </div>
  );
}

function PokerStackPreview({ amount = 300 }: { amount?: number }) {
  return <PokerChipStack amount={amount} maximum={1000} pot />;
}

function ModalDemo() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);

  const open = () => {
    setClosing(false);
    dialog.current?.showModal();
  };
  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      dialog.current?.close();
      setClosing(false);
    }, 250);
  };

  return (
    <div className={styles.centered}>
      <button type="button" className={styles.primary} onClick={open}>
        <Play size={13} /> Ouvrir la modale
      </button>
      <dialog
        ref={dialog}
        className={`modal ${closing ? "is-closing" : ""}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <button
          type="button"
          className="icon-button modal-close"
          onClick={close}
          aria-label="Fermer"
        >
          <X size={18} />
        </button>
        <div className="modal-emblem">
          <Sparkles size={22} />
        </div>
        <h2>Transition de modale</h2>
        <p className="modal-intro">
          Entrée, fond et sortie utilisent exactement les styles de la table.
        </p>
      </dialog>
    </div>
  );
}

function ToastDemo({ run }: { run: number }) {
  const [closing, setClosing] = useState(false);
  return (
    <div className={styles.centered} key={run}>
      <div
        className={`${styles.inlineToast} toast ${closing ? "is-closing" : ""}`}
      >
        <Sparkles size={15} />
        Animation rejouée avec succès.
        <button
          type="button"
          className="icon-button"
          onClick={() => setClosing(true)}
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function BlackjackDemos() {
  return (
    <div className={styles.grid}>
      <Demo
        title="Distribution"
        note="Cartes successives, face et dos."
        sound="card"
      >
        {() => (
          <div className={styles.cardRow}>
            <PlayingCard card={cards.aceSpades} index={0} dealDelay={0} />
            <PlayingCard card={cards.kingHearts} index={1} dealDelay={90} />
            <PlayingCard card={cards.queenDiamonds} index={2} dealDelay={180} />
            <PlayingCard back index={3} dealDelay={270} />
          </div>
        )}
      </Demo>

      <Demo
        title="Révélation croupier"
        note="Remplacement du dos par la carte révélée."
        sound="card"
      >
        {(run) => <DealerReveal key={run} />}
      </Demo>

      <Demo
        title="Résultat de main"
        note="Gain, perte, égalité et blackjack."
        sound="win"
      >
        {(run) => <ResultDemo run={run} />}
      </Demo>

      <Demo
        title="Piles de jetons"
        note="Montants simples et combinaisons de couleurs. Cliquez une pile pour la rejouer."
        className={styles.chipDemo}
        sound="chips"
      >
        {() => <ChipStackDemo />}
      </Demo>

      <Demo
        title="Side bet gagné"
        note="Le gain arrive de la banque, fusionne avec la mise, puis repart vers le joueur."
        sound="win"
      >
        {() => <SettlementDemo kind="side" payout={250} />}
      </Demo>

      <Demo
        title="Side bet perdu"
        note="La banque collecte la mise secondaire."
        sound="loss"
      >
        {() => <SettlementDemo kind="side" payout={0} />}
      </Demo>

      <Demo
        title="Paiement Blackjack"
        note="Les jetons gagnés rejoignent la mise avant que le total soit rendu au joueur."
        sound="win"
      >
        {() => <SettlementDemo kind="main" payout={50} />}
      </Demo>

      <Demo
        title="Mélange du sabot"
        note="Animation complète avant une nouvelle chaussure."
        sound="shuffle"
      >
        {() => (
          <div className={styles.shuffleStage}>
            <PokerShuffleAnimation
              hand={11}
              eyebrow="MANCHE 012 · 8 JEUX"
              title="Mélange du sabot"
              ariaLabel="Démonstration du mélange du sabot"
            />
          </div>
        )}
      </Demo>

      <Demo
        title="Gamble"
        note="Dos en attente puis révélation de la carte."
        sound="card"
      >
        {(run) => <GambleCard key={run} />}
      </Demo>
    </div>
  );
}

function DealerReveal() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 650);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={styles.cardRow}>
      <PlayingCard card={cards.tenSpades} />
      <PlayingCard
        key={revealed ? "front" : "back"}
        card={revealed ? cards.sevenDiamonds : undefined}
        back={!revealed}
      />
      <span className={styles.stateLabel}>
        {revealed ? "17 · RESTE" : "DOUBLE · ?"}
      </span>
    </div>
  );
}

function GambleCard() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 900);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={`gamble-active ${styles.gambleDemo}`}>
      <div className={`gamble-card-stage ${revealed ? "revealed" : ""}`}>
        <span className="gamble-card-label">CARTE TIRÉE</span>
        <div className="gamble-card-frame">
          <PlayingCard
            key={revealed ? "red" : "back"}
            card={revealed ? cards.queenDiamonds : undefined}
            back={!revealed}
          />
        </div>
        <em className="gamble-card-color red">
          {revealed ? "ROUGE · GAGNÉ" : "EN ATTENTE"}
        </em>
      </div>
    </div>
  );
}

type PokerPlayerState = "countdown" | "win" | "lose";

function PokerPlayerStateDemo() {
  const [state, setState] = useState<PokerPlayerState>("countdown");
  const [remaining, setRemaining] = useState(12);

  useEffect(() => {
    if (state !== "countdown") return;
    setRemaining(12);
    const timer = window.setInterval(
      () => setRemaining((value) => (value <= 0.25 ? 12 : value - 0.25)),
      250,
    );
    return () => window.clearInterval(timer);
  }, [state]);

  const winner = state === "win";
  const lost = state === "lose";
  const progress = 100 * (1 - remaining / 12);

  return (
    <div className={styles.pokerStateDemo}>
      <div className={styles.segmented}>
        {(["countdown", "win", "lose"] as PokerPlayerState[]).map((value) => (
          <button
            type="button"
            className={state === value ? styles.selected : ""}
            onClick={() => setState(value)}
            key={value}
          >
            {value === "countdown"
              ? "Countdown"
              : value === "win"
                ? "Victoire"
                : "Perte"}
          </button>
        ))}
      </div>

      <div className={`poker-felt ${styles.playerStateCanvas}`}>
        <div
          className={`poker-seat occupied mine ${state === "countdown" ? "acting" : ""} ${winner ? "winner" : ""} ${lost ? styles.lostPlayer : ""}`}
        >
          <div className="poker-hole-cards">
            <PlayingCard
              card={cards.aceSpades}
              index={0}
              highlighted={winner}
              dimmed={lost}
              decorative={!winner}
            />
            <PlayingCard
              card={cards.kingHearts}
              index={1}
              highlighted={winner}
              dimmed={lost}
              decorative={!winner}
            />
          </div>
          {winner && (
            <span className="winner-seal" aria-label="Gagnant">
              <Trophy size={11} />
            </span>
          )}
          <div
            className="poker-player-card"
            data-turn-seconds={
              state === "countdown" ? `${Math.ceil(remaining)}s` : undefined
            }
          >
            {state === "countdown" && (
              <svg className="poker-turn-outline" aria-hidden="true">
                <rect
                  className="poker-turn-track"
                  width="100%"
                  height="100%"
                  rx="10"
                  pathLength={100}
                />
                <rect
                  className="poker-turn-progress"
                  width="100%"
                  height="100%"
                  rx="10"
                  pathLength={100}
                  style={{ strokeDashoffset: progress }}
                />
              </svg>
            )}
            <span className="avatar tiny">J</span>
            <div>
              <b>Johann · Vous</b>
              <strong>
                <small>Stack</small> {winner ? "2 050" : "1 250"} cr.
              </strong>
            </div>
          </div>
          {state !== "countdown" && (
            <span
              className={`${styles.pokerOutcome} ${winner ? styles.pokerWin : styles.pokerLoss}`}
            >
              {winner ? "+800 · Quinte royale" : "Perdu · −250"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PokerDemos() {
  return (
    <div className={styles.grid}>
      <Demo
        title="Mélange du jeu"
        note="Split, riffle et remise au carré avant chaque nouvelle main."
        sound="shuffle"
      >
        {() => (
          <div className={`poker-felt ${styles.pokerShuffleFelt}`}>
            <PokerShuffleAnimation hand={41} />
          </div>
        )}
      </Demo>

      <Demo
        title="Cartes privées"
        note="Distribution alternée des deux hole cards."
        sound="card"
      >
        {() => (
          <div className={`poker-felt ${styles.miniFelt}`}>
            <div className={styles.pokerHoleCards}>
              <div className="poker-hole-cards">
                <PlayingCard card={cards.aceSpades} index={0} dealDelay={0} />
                <PlayingCard
                  card={cards.kingHearts}
                  index={1}
                  dealDelay={120}
                />
              </div>
            </div>
          </div>
        )}
      </Demo>

      <Demo
        title="Board"
        note="Flop, turn et river avec délais de distribution."
        sound="card"
      >
        {() => (
          <div className={`poker-felt ${styles.miniFelt}`}>
            <div className={`community-cards ${styles.community}`}>
              {[
                cards.queenDiamonds,
                cards.jackClubs,
                cards.tenSpades,
                cards.nineHearts,
                cards.eightClubs,
              ].map((card, index) => (
                <PlayingCard
                  card={card}
                  index={index}
                  dealDelay={index < 3 ? index * 85 : 330 + index * 100}
                  key={card.id}
                />
              ))}
            </div>
          </div>
        )}
      </Demo>

      <Demo
        title="Mise au poker"
        note="Construction d’une pile à plusieurs colonnes."
        sound="chips"
      >
        {() => (
          <div className={styles.centered}>
            <PokerStackPreview amount={650} />
          </div>
        )}
      </Demo>

      <Demo
        title="Collecte vers le pot"
        note="Les mises convergent vers le centre."
        sound="chips"
      >
        {() => (
          <div className={`poker-felt ${styles.collectStage}`}>
            {[
              { x: 20, y: 76, amount: 100 },
              { x: 50, y: 86, amount: 250 },
              { x: 80, y: 76, amount: 450 },
            ].map((chip, index) => (
              <div
                className="poker-chip-flight"
                key={chip.x}
                style={
                  {
                    "--chip-from-x": `${chip.x}%`,
                    "--chip-from-y": `${chip.y}%`,
                    "--chip-collect-delay": `${index * 90}ms`,
                  } as CSSProperties
                }
              >
                <PokerChipStack amount={chip.amount} maximum={500} />
              </div>
            ))}
            <div className={styles.potTarget}>
              <span>POT</span>
              <PokerStackPreview amount={800} />
            </div>
          </div>
        )}
      </Demo>

      <Demo
        title="Showdown"
        note="Combinaison gagnante, cartes atténuées et résultat."
        sound="win"
      >
        {() => (
          <div className={`poker-felt ${styles.showdownStage}`}>
            <div className={`community-cards ${styles.community}`}>
              <PlayingCard card={cards.queenDiamonds} highlighted />
              <PlayingCard card={cards.jackClubs} highlighted />
              <PlayingCard card={cards.tenSpades} highlighted />
              <PlayingCard card={cards.nineHearts} dimmed />
              <PlayingCard card={cards.eightClubs} dimmed />
            </div>
            <div className={`hand-result-banner ${styles.resultBanner}`}>
              <span className="result-medallion">
                <Trophy size={19} />
              </span>
              <div className="result-copy">
                <span className="result-kicker">ABATTAGE · MAIN #042</span>
                <div className="result-winners">
                  <p>
                    <span>
                      <b>Vous</b>
                      <small>Quinte royale</small>
                    </span>
                    <strong>+800 cr.</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Demo>

      <Demo
        title="Countdown et résultat joueur"
        note="Tour actif, victoire et perte sont trois états distincts."
        sound="ui"
      >
        {() => <PokerPlayerStateDemo />}
      </Demo>

      <Demo
        title="Roue Spin"
        note="Arrivée complète avec rotation et multiplicateur."
        sound="shuffle"
      >
        {() => (
          <div className={styles.spinStage}>
            <div className="spin-wheel">
              <span>×2</span>
              <span>×3</span>
              <span>×5</span>
              <span>×10</span>
              <span>×2</span>
              <strong>×5</strong>
            </div>
          </div>
        )}
      </Demo>
    </div>
  );
}

function InterfaceDemos() {
  return (
    <div className={styles.grid}>
      <Demo title="Modale" note="Entrée, backdrop et sortie de production.">
        {() => <ModalDemo />}
      </Demo>
      <Demo title="Toast" note="Entrée et fermeture interruptible.">
        {(run) => <ToastDemo run={run} />}
      </Demo>
      <Demo title="Solde" note="Mise à jour ponctuelle du portefeuille.">
        {() => (
          <div className={styles.centered}>
            <div className="wallet">
              <Coins size={16} />
              <b>12 450</b>
              <span>crédits</span>
            </div>
          </div>
        )}
      </Demo>
      <Demo title="Invitation Gamble" note="État disponible après un gain.">
        {() => (
          <div className={styles.gamblePromptWrap}>
            <button type="button" className="gamble-prompt">
              <span className="gamble-prompt-emblem" aria-hidden="true">
                <Diamond size={13} />
                <Spade size={11} />
              </span>
              <span className="gamble-prompt-copy">
                <strong>Tenter 250 cr.</strong>
                <small>GAMBLE · ROUGE OU NOIR</small>
              </span>
              <Play className="gamble-prompt-arrow" size={13} />
            </button>
          </div>
        )}
      </Demo>
    </div>
  );
}

export function AnimationLab() {
  const [section, setSection] = useState<Section>("blackjack");
  const [allRun, setAllRun] = useState(0);
  const audio = useLabAudio();

  return (
    <LabAudioContext.Provider value={audio.play}>
      <main className={styles.page}>
        <header className={styles.hero}>
          <div>
            <span className={styles.kicker}>MINUIT · OUTIL INTERNE</span>
            <h1>Animation lab</h1>
            <p>
              Tous les mouvements de jeu, sans partie ni connexion. Choisissez
              un état, rejouez-le, puis contrôlez son rendu à chaque breakpoint.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={`${styles.soundToggle} ${audio.enabled ? styles.soundEnabled : ""}`}
              onClick={audio.toggle}
              aria-label={
                audio.enabled ? "Désactiver les sons" : "Activer les sons"
              }
              aria-pressed={audio.enabled}
              title={audio.enabled ? "Désactiver les sons" : "Activer les sons"}
            >
              {audio.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                audio.play("ui");
                setAllRun((value) => value + 1);
              }}
            >
              <RotateCcw size={14} /> Tout relancer
            </button>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Familles d’animations">
          {(
            [
              ["blackjack", "Blackjack", "09"],
              ["poker", "Poker", "08"],
              ["interface", "Interface", "04"],
            ] as const
          ).map(([value, label, count]) => (
            <button
              type="button"
              className={section === value ? styles.activeTab : ""}
              aria-current={section === value ? "page" : undefined}
              onClick={() => setSection(value)}
              key={value}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </nav>

        <section key={`${section}-${allRun}`} className={styles.content}>
          {section === "blackjack" ? (
            <BlackjackDemos />
          ) : section === "poker" ? (
            <PokerDemos />
          ) : (
            <InterfaceDemos />
          )}
        </section>

        <footer className={styles.footer}>
          Route publique non référencée · animations réelles de production ·
          respecte <code>prefers-reduced-motion</code>
        </footer>
      </main>
    </LabAudioContext.Provider>
  );
}

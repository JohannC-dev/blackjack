"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Coins,
  Diamond,
  Eye,
  EyeOff,
  History,
  House,
  Layers2,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Spade,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import {
  betTotal,
  canSplitCards,
  credits,
  isRed,
  rankLabel,
  score,
  SUITS,
} from "@/lib/rules";
import { DEFAULT_PUBLIC_TABLE_ID, PUBLIC_TABLES } from "@/lib/table-config";
import type {
  Bet,
  GambleColor,
  GambleState,
  Hand,
  Seat,
  TableState,
} from "@/lib/types";
import { newToken } from "@/lib/identity";
import { useGame } from "@/lib/use-game";
import { PlayingCard } from "./playing-card";
import { CasinoHome, PokerCasino } from "./poker-casino";
import { ShoeShuffleAnimation } from "./shoe-shuffle";

const THREE_PAYOUTS = [
  ["Straight Flush", "9:1"],
  ["Three of a Kind", "9:1"],
  ["Straight", "9:1"],
  ["Flush", "9:1"],
];
const PAIR_PAYOUTS = [
  ["Suited Trips", "50:1"],
  ["Suited Pair", "25:1"],
  ["Prime Pair", "10:1"],
  ["Any Pair", "8:1"],
];
const EMPTY_SEATS: Seat[] = Array.from({ length: 5 }, (_, index) => ({
  index,
  playerId: null,
  bet: { main: 0, three: 0, pairs: 0 },
  hands: [],
  sides: { three: null, pairs: null },
  committed: 0,
}));
const POSITIONS = [
  { x: 12, y: 49 },
  { x: 30, y: 66 },
  { x: 50, y: 72 },
  { x: 70, y: 66 },
  { x: 88, y: 49 },
];
const labels = { main: "Blackjack", three: "21 + 3", pairs: "Super Pairs" };
const historyResultLabels = {
  win: "Gagné",
  lose: "Perdu",
  push: "Égalité",
  blackjack: "Blackjack",
  none: "Pas de mise",
};

function motionDuration(normal: number, reduced: number) {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? reduced
    : normal;
}

function formatNet(value: number) {
  if (value > 0) return `+${credits(value)}`;
  if (value < 0) return `−${credits(Math.abs(value))}`;
  return credits(0);
}

function netTone(value: number) {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
      ref.current?.close();
    };
  }, []);

  const requestClose = () => {
    if (!onClose || closing || closeTimer.current !== null) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(
      () => {
        closeTimer.current = null;
        onClose();
      },
      motionDuration(250, 160),
    );
  };

  return (
    <dialog
      ref={ref}
      className={`modal ${className} ${closing ? "is-closing" : ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && onClose) {
          const r = ref.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            requestClose();
        }
      }}
    >
      {onClose && (
        <button
          className="icon-button modal-close"
          onClick={requestClose}
          aria-label="Fermer"
        >
          <X size={19} />
        </button>
      )}
      {children}
    </dialog>
  );
}

function HoldToConfirmButton({
  children,
  disabled,
  onConfirm,
  title,
  ariaLabel,
}: {
  children: ReactNode;
  disabled: boolean;
  onConfirm: () => void;
  title: string;
  ariaLabel: string;
}) {
  const timer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const cancel = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  };

  const start = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || timer.current !== null) return;
    if (event) event.currentTarget.setPointerCapture?.(event.pointerId);
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, 2000);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
      event.preventDefault();
      start();
    }
  };

  const handleKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <button
      type="button"
      className={`icon-button hold-to-confirm ${holding ? "is-holding" : ""}`}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onBlur={cancel}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onClick={(event) => event.preventDefault()}
    >
      <span className="hold-to-confirm-progress" aria-hidden="true" />
      {children}
    </button>
  );
}

function AnimatedTableChip({
  amount,
  className,
  placeholder,
}: {
  amount: number;
  className: string;
  placeholder: ReactNode;
}) {
  const [renderedAmount, setRenderedAmount] = useState<number | null>(
    amount > 0 ? amount : null,
  );
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (exitTimer.current !== null) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }

    if (amount > 0) {
      setRenderedAmount(amount);
      setExiting(false);
      return;
    }

    if (renderedAmount === null) {
      setExiting(false);
      return;
    }

    setExiting(true);
    exitTimer.current = window.setTimeout(
      () => {
        exitTimer.current = null;
        setRenderedAmount(null);
        setExiting(false);
      },
      motionDuration(180, 120),
    );

    return () => {
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
    };
  }, [amount, renderedAmount]);

  if (renderedAmount === null) {
    return <span className="spot-placeholder">{placeholder}</span>;
  }

  return (
    <span
      key={renderedAmount}
      className={`table-chip ${className} ${exiting ? "is-exiting" : ""}`}
    >
      {credits(renderedAmount)}
    </span>
  );
}

function AnimatedMenu({
  active,
  className,
  children,
}: {
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  const [present, setPresent] = useState(active);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const lastChildren = useRef<ReactNode>(active ? children : null);

  if (active) lastChildren.current = children;

  useEffect(() => {
    if (exitTimer.current !== null) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }

    if (active) {
      setPresent(true);
      setClosing(false);
      return;
    }

    if (!present) return;

    setClosing(true);
    exitTimer.current = window.setTimeout(
      () => {
        exitTimer.current = null;
        setPresent(false);
        setClosing(false);
      },
      motionDuration(200, 140),
    );

    return () => {
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
    };
  }, [active, present]);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  if (!present && !active) return null;

  return (
    <div className={`${className} ${closing ? "is-closing" : ""}`}>
      {active ? children : lastChildren.current}
    </div>
  );
}

function Chip({
  amount,
  selected = false,
  onClick,
  disabled = false,
}: {
  amount: number;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`chip chip-${amount} ${selected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Sélectionner le jeton de ${amount} crédits`}
      aria-pressed={selected}
    >
      <span>{amount}</span>
    </button>
  );
}

function HandView({ hand, active }: { hand: Hand; active: boolean }) {
  const concealed = hand.cards.some((card) => card.hidden);
  const value = score(hand.cards.filter((card) => !card.hidden));
  return (
    <div
      className={`hand ${active ? "active-hand" : ""} ${hand.result === "win" || hand.result === "blackjack" ? "winning-hand" : ""}`}
    >
      <div className="hand-cards">
        {hand.cards.map((card, index) => (
          <PlayingCard key={card.id} card={card} index={index} />
        ))}
      </div>
      {!!hand.cards.length && (
        <span
          className={`hand-score ${concealed ? "concealed-score" : ""} ${value.total > 21 ? "busted" : ""} ${hand.status === "blackjack" ? "natural" : ""}`}
        >
          {concealed
            ? "DOUBLE · ?"
            : hand.status === "blackjack"
              ? "BLACKJACK"
              : `${value.soft ? "S · " : ""}${value.total}`}
          {hand.result === "win" && <Check size={10} />}
        </span>
      )}
      {hand.result && (
        <span className={`hand-result ${hand.result}`}>
          {hand.result === "push"
            ? "Égalité"
            : hand.result === "lose"
              ? "Perdu"
              : `+${credits((hand.payout ?? 0) - hand.bet)}`}
        </span>
      )}
    </div>
  );
}

function SeatView({
  seat,
  state,
  playerId,
  selected,
  onSelect,
  onBet,
  chip,
  disabled,
}: {
  seat: Seat;
  state: TableState | null;
  playerId: string;
  selected: boolean;
  onSelect: () => void;
  onBet: (type: keyof Bet) => void;
  chip: number;
  disabled: boolean;
}) {
  const owner = state?.players.find((p) => p.id === seat.playerId);
  const mine = !!owner && owner.id === playerId;
  const active = seat.hands.some((h) => h.id === state?.activeHandId);
  const pos = POSITIONS[seat.index];
  const hasCards = seat.hands.some((h) => h.cards.length);
  const canBet =
    mine && state?.phase === "betting" && !owner?.ready && !disabled;
  const sideBetsResolved =
    !!state && state.phase !== "betting" && state.phase !== "dealing";
  return (
    <div
      className={`seat seat-${seat.index} ${owner ? "occupied" : "empty"} ${mine ? "my-seat" : ""} ${selected && mine ? "selected-seat" : ""} ${active ? "current-seat" : ""} ${hasCards ? "has-cards" : ""}`}
      style={
        { "--seat-x": `${pos.x}%`, "--seat-y": `${pos.y}%` } as CSSProperties
      }
    >
      {hasCards && (
        <div
          className={`seat-hands ${seat.hands.length > 1 ? "split-hands" : ""}`}
        >
          {seat.hands.map((hand) => (
            <HandView
              key={hand.id}
              hand={hand}
              active={hand.id === state?.activeHandId}
            />
          ))}
        </div>
      )}
      {owner ? (
        <div className="table-bet-zones">
          {(["three", "main", "pairs"] as (keyof Bet)[]).map((type) => {
            const sideResult =
              type === "three"
                ? seat.sides.three
                : type === "pairs"
                  ? seat.sides.pairs
                  : null;
            const resolvedSideBet =
              type !== "main" && sideBetsResolved && seat.bet[type] > 0;
            return (
              <button
                key={type}
                className={`table-bet-spot spot-${type} ${seat.bet[type] ? "has-chips" : ""} ${resolvedSideBet ? (sideResult ? "side-bet-won" : "side-bet-lost") : ""}`}
                onClick={() => onBet(type)}
                disabled={!canBet}
                aria-label={`Miser ${chip} crédits sur ${labels[type]}, main ${seat.index + 1}`}
                title={
                  canBet
                    ? `+${chip} crédits · ${labels[type]}`
                    : `${labels[type]} : ${seat.bet[type]} crédits`
                }
              >
                <span className="spot-label">
                  {type === "main"
                    ? "BLACKJACK"
                    : type === "three"
                      ? "21 + 3"
                      : "SUPER PAIRS"}
                </span>
                <AnimatedTableChip
                  amount={seat.bet[type]}
                  className={`${type !== "main" ? "side-chip" : ""} ${resolvedSideBet ? (sideResult ? "winning-side-chip" : "losing-side-chip") : ""}`}
                  placeholder={
                    type === "main" ? (
                      <Plus size={19} strokeWidth={1.4} />
                    ) : type === "three" ? (
                      <Diamond size={13} />
                    ) : (
                      <Layers2 size={13} />
                    )
                  }
                />
                {state?.phase === "bonuses" && sideResult && (
                  <span className="bonus-chip-flight" aria-hidden="true">
                    <span className="bonus-chip-stack">
                      <span className="bonus-chip-amount">
                        {credits(sideResult.payout)}
                      </span>
                    </span>
                    <span className="bonus-chip-caption">
                      +{credits(sideResult.payout)}
                      <small>{sideResult.label}</small>
                    </span>
                  </span>
                )}
                {canBet && <span className="spot-hover">+{chip}</span>}
              </button>
            );
          })}
        </div>
      ) : !hasCards ? (
        <div className="empty-bet-zones">
          <span className="empty-bonus-zone left">21+3</span>
          <button
            className="seat-target"
            onClick={onSelect}
            aria-label={`Prendre la place ${seat.index + 1}`}
          >
            <Plus size={19} strokeWidth={1.4} />
            <span>PRENDRE PLACE</span>
          </button>
          <span className="empty-bonus-zone right">PAIRS</span>
        </div>
      ) : null}
      <button
        className="seat-name"
        onClick={onSelect}
        disabled={!!owner && !mine}
        aria-label={
          owner
            ? `Main ${seat.index + 1} · ${owner.name}`
            : `Place ${seat.index + 1} libre`
        }
      >
        {owner ? (
          <>
            <span className="avatar tiny">
              {owner.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              {owner.name}
              {mine && (
                <small>
                  vous
                  {(state?.seats.filter((s) => s.playerId === playerId)
                    .length ?? 0) > 1
                    ? ` · ${seat.index + 1}`
                    : ""}
                </small>
              )}
            </span>
            {owner.ready && state?.phase === "betting" ? (
              <Check className="ready-mark" size={13} />
            ) : !owner.connected ? (
              <span className="offline-dot" />
            ) : null}
          </>
        ) : (
          <span className="empty-seat-label">Installez-vous</span>
        )}
      </button>
      {(seat.sides.three || seat.sides.pairs) && (
        <div className="side-win">
          <Sparkles size={10} />
          {seat.sides.three?.label || seat.sides.pairs?.label}
          {seat.sides.three && seat.sides.pairs && " + Pairs"}
        </div>
      )}
    </div>
  );
}

function Paytable({
  kind,
  expanded = false,
}: {
  kind: "three" | "pairs";
  expanded?: boolean;
}) {
  return (
    <div className={`paytable ${kind}`}>
      <div className="paytable-heading">
        <span className="side-icon">
          {kind === "three" ? <Diamond size={17} /> : <Layers2 size={17} />}
        </span>
        <div>
          <h3>{kind === "three" ? "21 + 3" : "Super Pairs"}</h3>
          <p>
            {kind === "three"
              ? "Trois cartes. Plus de possibilités."
              : "La bonne paire change tout."}
          </p>
        </div>
        <span className="max-payout">{kind === "three" ? "×9" : "×50"}</span>
      </div>
      <div className="payout-rows">
        {(kind === "three" ? THREE_PAYOUTS : PAIR_PAYOUTS).map(
          ([label, odds]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{odds}</b>
            </div>
          ),
        )}
      </div>
      {expanded && (
        <p className="paytable-description">
          {kind === "three"
            ? "Vos deux cartes initiales et la carte visible du croupier. Une seule combinaison est payée. L’as compte bas (A-2-3) ou haut (Q-K-A)."
            : "Vos deux cartes initiales : même enseigne = Suited Pair ; même couleur rouge/noir = Prime Pair ; sinon Any Pair. Suited Trips ajoute la carte du croupier, identique aux vôtres. Seul le meilleur gain est payé."}
        </p>
      )}
    </div>
  );
}

function GamblePrompt({
  stake,
  disabled,
  compact = false,
  onOpen,
}: {
  stake: number;
  disabled: boolean;
  compact?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`gamble-prompt ${compact ? "compact" : ""}`}
      disabled={disabled}
      onClick={onOpen}
      aria-label={`Tenter vos gains de ${credits(stake)} crédits`}
    >
      <span className="gamble-prompt-emblem" aria-hidden="true">
        <Diamond size={13} />
        <Spade size={11} />
      </span>
      <span className="gamble-prompt-copy">
        <strong>
          {compact ? "Gamble" : "Tenter"} {credits(stake)} cr.
        </strong>
        {!compact && <small>GAMBLE · ROUGE OU NOIR</small>}
      </span>
      <ArrowRight
        className="gamble-prompt-arrow"
        size={14}
        aria-hidden="true"
      />
    </button>
  );
}

function GamblePanel({
  gamble,
  disabled,
  onGamble,
  onCashout,
  onClose,
}: {
  gamble: GambleState;
  disabled: boolean;
  onGamble: (color: GambleColor) => void;
  onCashout: () => void;
  onClose: () => void;
}) {
  const available = gamble.status === "available";
  const cardColor = gamble.card ? (isRed(gamble.card) ? "red" : "black") : null;
  const outcomeLabel =
    gamble.status === "lost" ? "La chance s’arrête ici." : "Gains encaissés.";
  const amountLabel =
    gamble.status === "lost"
      ? "Montant perdu"
      : available
        ? "À tenter maintenant"
        : "Gain encaissé";

  return (
    <div
      className={`gamble-panel ${available ? "gamble-active" : "gamble-closed"}`}
      aria-label="Gamble des gains"
    >
      <button
        type="button"
        className="gamble-panel-close"
        onClick={onClose}
        aria-label="Fermer le gamble"
      >
        <X size={14} />
      </button>
      <div className="gamble-copy">
        <span className="section-kicker">GAMBLE DES GAINS</span>
        <h3>
          {available
            ? gamble.streak
              ? "Encore une carte ?"
              : "Doublez vos gains."
            : outcomeLabel}
        </h3>
        <p>
          {available
            ? "Rouge ou noir. La bonne couleur double la mise."
            : gamble.status === "lost"
              ? "Votre gain a été remis en jeu sur la dernière carte."
              : "Vous gardez votre gain et la table prépare la suite."}
        </p>
        <div className="gamble-amount">
          <span>{amountLabel}</span>
          <strong>
            {credits(gamble.stake)} <small>cr.</small>
          </strong>
          {gamble.streak > 0 && available && <em>Série ×{gamble.streak}</em>}
        </div>
      </div>

      <div className={`gamble-card-stage ${gamble.card ? "revealed" : ""}`}>
        <span className="gamble-card-label">
          {gamble.card ? "DERNIÈRE CARTE" : "TIREZ UNE CARTE"}
        </span>
        <div className="gamble-card-frame">
          <PlayingCard
            card={gamble.card ?? undefined}
            back={!gamble.card}
            decorative
          />
        </div>
        {gamble.card && (
          <small className={`gamble-card-color ${cardColor}`}>
            {cardColor === "red" ? "ROUGE" : "NOIR"}
          </small>
        )}
      </div>

      <div className="gamble-actions">
        {available ? (
          <>
            <span className="gamble-choice-label">CHOISISSEZ UNE COULEUR</span>
            <div className="gamble-color-choices">
              <button
                type="button"
                className="gamble-color-button red"
                disabled={disabled}
                onClick={() => onGamble("red")}
                aria-label="Tirer une carte rouge"
              >
                <Diamond size={17} />
                <span>
                  Rouge
                  <small>♥ ♦</small>
                </span>
              </button>
              <span className="gamble-or">ou</span>
              <button
                type="button"
                className="gamble-color-button black"
                disabled={disabled}
                onClick={() => onGamble("black")}
                aria-label="Tirer une carte noire"
              >
                <Spade size={17} />
                <span>
                  Noir
                  <small>♠ ♣</small>
                </span>
              </button>
            </div>
            <button
              type="button"
              className="gamble-cashout"
              disabled={disabled}
              onClick={onCashout}
            >
              Encaisser {credits(gamble.stake)} cr.
            </button>
            <small className="gamble-countdown">
              Disponible jusqu’à votre décision.
            </small>
          </>
        ) : (
          <>
            <div className={`gamble-result ${gamble.status}`}>
              {gamble.status === "lost" ? "Perdu" : "Encaissé"}
              {gamble.card && (
                <span>
                  {rankLabel(gamble.card.rank)} {SUITS[gamble.card.suit]}
                </span>
              )}
            </div>
            <small className="gamble-countdown">
              Vous pouvez reprendre la partie.
            </small>
          </>
        )}
      </div>
    </div>
  );
}

export type CasinoView = "home" | "blackjack" | "poker";

export function Casino() {
  const game = useGame();
  const [view, setView] = useState<CasinoView>("home");
  const navigate = (next: CasinoView) => setView(next);
  if (!game.profile)
    return <BlackjackCasino game={game} onNavigate={navigate} />;
  if (view === "home") return <CasinoHome game={game} onNavigate={navigate} />;
  if (view === "poker")
    return <PokerCasino game={game} onNavigate={navigate} />;
  return <BlackjackCasino game={game} onNavigate={navigate} />;
}

function BlackjackCasino({
  game,
  onNavigate,
}: {
  game: ReturnType<typeof useGame>;
  onNavigate: (view: CasinoView) => void;
}) {
  const { state, playerId, connected, profile, loaded, command, pending } =
    game;
  const [modal, setModal] = useState<
    "rules" | "tables" | "history" | "invite" | null
  >(null);
  const [name, setName] = useState("");
  const [tableCode, setTableCode] = useState("");
  const [selectedSeat, setSelectedSeat] = useState(2);
  const [betHistory, setBetHistory] = useState<{ seat: number; before: Bet }[]>(
    [],
  );
  const [chip, setChip] = useState(25);
  const [toast, setToast] = useState("");
  const [notice, setNotice] = useState<{
    message: string;
    error: boolean;
    visible: boolean;
  } | null>(null);
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(0);
  const [doubleChoice, setDoubleChoice] = useState<string | null>(null);
  const [doubleChoiceClosing, setDoubleChoiceClosing] = useState(false);
  const [gambleOpen, setGambleOpen] = useState(false);
  const [gamblePromptFeatured, setGamblePromptFeatured] = useState(false);
  const [shoeShuffling, setShoeShuffling] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const previousCards = useRef(0);
  const previousShoe = useRef<{ tableId: string; remaining: number } | null>(
    null,
  );
  const doubleCloseTimer = useRef<number | null>(null);
  const noticeCloseTimer = useRef<number | null>(null);
  const me = state?.players.find((p) => p.id === playerId);
  const ownSeats = state?.seats.filter((s) => s.playerId === playerId) ?? [];
  const seat = ownSeats.find((s) => s.index === selectedSeat) ?? ownSeats[0];
  const balance = me?.balance ?? profile?.balance ?? 2000;
  const betting = !state || state.phase === "betting";
  const canChangeTable = betting || ownSeats.length === 0;
  const totalBet = ownSeats.reduce((sum, s) => sum + betTotal(s.bet), 0);
  const activeSeat = state?.seats.find((s) =>
    s.hands.some((h) => h.id === state.activeHandId),
  );
  const activeHand = activeSeat?.hands.find(
    (h) => h.id === state?.activeHandId,
  );
  const myTurn =
    state?.phase === "playing" && activeSeat?.playerId === playerId;
  const myHistory = state?.history.filter((h) => h.playerId === playerId) ?? [];
  const sessionNet = myHistory.reduce((sum, item) => sum + item.net, 0);
  const myBonus = ownSeats.reduce(
    (sum, s) =>
      sum + (s.sides.three?.payout ?? 0) + (s.sides.pairs?.payout ?? 0),
    0,
  );
  const roundResult =
    state?.phase === "settled"
      ? myHistory.find((h) => h.round === state.round)
      : undefined;
  const ownGambles =
    state?.gambles.filter((entry) => entry.playerId === playerId) ?? [];
  const ownGamble =
    ownGambles.find((entry) => entry.status === "available") ??
    ownGambles.at(-1);
  const seconds = state?.deadline
    ? Math.max(0, Math.ceil((state.deadline - now) / 1000))
    : null;
  const disabled = !connected || pending;
  const cardCount =
    (state?.dealer.length ?? 0) +
    (state?.seats
      .flatMap((s) => s.hands)
      .reduce((n, h) => n + h.cards.length, 0) ?? 0);

  const closeDoubleChoice = () => {
    if (
      !doubleChoice ||
      doubleChoiceClosing ||
      doubleCloseTimer.current !== null
    )
      return;
    setDoubleChoiceClosing(true);
    if (doubleCloseTimer.current !== null) {
      window.clearTimeout(doubleCloseTimer.current);
    }
    doubleCloseTimer.current = window.setTimeout(
      () => {
        doubleCloseTimer.current = null;
        setDoubleChoice(null);
        setDoubleChoiceClosing(false);
      },
      motionDuration(180, 120),
    );
  };

  useEffect(() => {
    setBetHistory([]);
  }, [state?.round, state?.id]);
  useEffect(() => {
    setGambleOpen(false);
  }, [state?.id]);
  useEffect(() => {
    if (ownGamble?.status !== "available") {
      setGamblePromptFeatured(false);
      return;
    }
    setGamblePromptFeatured(true);
    const timer = window.setTimeout(() => setGamblePromptFeatured(false), 7000);
    return () => window.clearTimeout(timer);
  }, [ownGamble?.round, ownGamble?.status, state?.id]);
  useEffect(() => {
    if (doubleCloseTimer.current !== null) {
      window.clearTimeout(doubleCloseTimer.current);
      doubleCloseTimer.current = null;
    }
    setDoubleChoice(null);
    setDoubleChoiceClosing(false);
  }, [state?.activeHandId]);
  useEffect(
    () => () => {
      if (doubleCloseTimer.current !== null)
        window.clearTimeout(doubleCloseTimer.current);
      if (noticeCloseTimer.current !== null)
        window.clearTimeout(noticeCloseTimer.current);
    },
    [],
  );
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!game.error) return;
    const timer = setTimeout(() => game.setError(""), 6000);
    return () => clearTimeout(timer);
  }, [game.error, game.setError]);
  const notification = game.error || toast;
  useEffect(() => {
    if (noticeCloseTimer.current !== null) {
      window.clearTimeout(noticeCloseTimer.current);
      noticeCloseTimer.current = null;
    }

    if (notification) {
      setNotice({
        message: notification,
        error: !!game.error,
        visible: true,
      });
      return;
    }

    setNotice((current) => (current ? { ...current, visible: false } : null));
    noticeCloseTimer.current = window.setTimeout(
      () => {
        noticeCloseTimer.current = null;
        setNotice(null);
      },
      motionDuration(180, 120),
    );

    return () => {
      if (noticeCloseTimer.current !== null) {
        window.clearTimeout(noticeCloseTimer.current);
        noticeCloseTimer.current = null;
      }
    };
  }, [game.error, notification]);
  useEffect(() => {
    if (!state) {
      previousShoe.current = null;
      setShoeShuffling(false);
      return;
    }
    const previous = previousShoe.current;
    previousShoe.current = {
      tableId: state.id,
      remaining: state.shoeRemaining,
    };
    if (!previous || previous.tableId !== state.id) {
      setShoeShuffling(false);
      return;
    }
    if (state.shoeRemaining <= previous.remaining + 20) return;

    setShoeShuffling(true);
    const timer = window.setTimeout(() => setShoeShuffling(false), 2600);
    return () => window.clearTimeout(timer);
  }, [state?.id, state?.shoeRemaining]);
  useEffect(() => {
    if (sound && cardCount > previousCards.current && audioRef.current) {
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(680, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.055);
      gain.gain.setValueAtTime(0.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
    previousCards.current = cardCount;
  }, [cardCount, sound]);

  const selectSeat = (s: Seat) => {
    if (!profile) return;
    if (s.playerId === playerId) setSelectedSeat(s.index);
    else if (!s.playerId) {
      if (!betting) {
        setToast("Prenez une place dès la prochaine manche.");
        return;
      }
      command({ type: "claim", seat: s.index });
      setSelectedSeat(s.index);
    }
  };
  const placeBet = (target: Seat, type: keyof Bet) => {
    if (target.playerId !== playerId || !betting || me?.ready || disabled)
      return;
    if (type !== "main" && !target.bet.main) {
      setToast("Posez d’abord un jeton sur Blackjack pour cette main.");
      return;
    }
    setSelectedSeat(target.index);
    const before = { ...target.bet };
    void command({
      type: "bet",
      seat: target.index,
      bet: { ...before, [type]: before[type] + chip },
    }).then((ok) => {
      if (ok)
        setBetHistory((history) => [
          ...history,
          { seat: target.index, before },
        ]);
    });
  };
  const undoBet = () => {
    const last = betHistory.at(-1);
    if (!last) return;
    void command({ type: "bet", seat: last.seat, bet: last.before }).then(
      (ok) => {
        if (ok) setBetHistory((history) => history.slice(0, -1));
      },
    );
  };
  const clearBets = async () => {
    for (const target of ownSeats)
      if (betTotal(target.bet)) {
        const ok = await command({
          type: "bet",
          seat: target.index,
          bet: { main: 0, three: 0, pairs: 0 },
        });
        if (!ok) return;
      }
    setBetHistory([]);
  };
  const gamble = (color: GambleColor) => {
    if (disabled) return;
    void command({ type: "gamble", color });
  };
  const cashout = async () => {
    if (disabled) return;
    const ok = await command({ type: "cashout" });
    if (!ok) return;
    setGambleOpen(false);
    setGamblePromptFeatured(false);
  };
  const shareUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("table", state?.id ?? "MINUIT");
    return url.toString();
  };
  const invite = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setToast("Lien copié. La table attend vos amis.");
    } catch {
      setModal("invite");
    }
  };
  const toggleSound = () => {
    if (!sound) {
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
    }
    setSound(!sound);
  };
  const subtitle = myTurn
    ? "C’est à vous de jouer"
    : state?.phase === "dealing"
      ? "Distribution en cours"
      : state?.phase === "bonuses"
        ? "Les paris annexes sont réglés"
        : state?.phase === "dealer"
          ? "Au tour du croupier"
          : state?.phase === "settled"
            ? ownGamble?.status === "available" && gambleOpen
              ? "Double ou rien"
              : ownGamble?.status === "available"
                ? "Tentez vos gains"
                : "Les jeux sont faits"
            : me?.ready
              ? "Vous êtes prêt"
              : "Faites vos jeux";

  return (
    <div className="casino-shell">
      <aside className="rail" aria-label="Navigation principale">
        <button
          type="button"
          className="brand-mark"
          aria-label="Minuit, accueil"
          onClick={() => onNavigate("home")}
        >
          <Spade size={28} fill="currentColor" strokeWidth={1.3} />
        </button>
        <div className="rail-navigation">
          <button
            className="rail-button"
            title="Accueil"
            aria-label="Accueil"
            onClick={() => onNavigate("home")}
          >
            <House size={21} />
          </button>
          <button
            className="rail-button active"
            title="Table de blackjack"
            aria-label="Table de blackjack"
            onClick={() => setModal(null)}
          >
            <Layers2 size={22} />
          </button>
          <button
            className="rail-button"
            title="Poker"
            aria-label="Poker"
            onClick={() => onNavigate("poker")}
          >
            <Spade size={21} />
          </button>
          <button
            className="rail-button"
            title="Changer de table"
            aria-label="Changer de table"
            onClick={() => setModal("tables")}
          >
            <Users size={22} />
          </button>
          <button
            className="rail-button"
            title="Historique"
            aria-label="Historique"
            onClick={() => setModal("history")}
          >
            <History size={21} />
          </button>
        </div>
        <div className="rail-bottom">
          <button
            className="rail-button"
            title="Règles du jeu"
            aria-label="Règles du jeu"
            onClick={() => setModal("rules")}
          >
            <CircleHelp size={21} />
          </button>
          <div className="rail-monogram">M.</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <a className="wordmark" href="/">
            MINUIT<span>●</span>
          </a>
          <span className="topbar-divider" />
          <div className="topbar-right">
            <div className="wallet">
              <Wallet size={17} />
              <b key={balance}>{credits(balance)}</b>
              <span>crédits</span>
              <Coins size={16} className="wallet-coin" />
            </div>
            <div
              className="profile-avatar"
              title={me?.name ?? profile?.name ?? "Votre profil"}
            >
              {(me?.name ?? profile?.name ?? "M").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                LE CLUB <span>/</span> JEUX DE TABLE
              </div>
              <h1>
                Blackjack <span>Européen</span>
                <span className="live-tag">
                  <i />
                  LIVE
                </span>
              </h1>
            </div>
            <button className="button secondary invite-button" onClick={invite}>
              <Users size={16} />
              Inviter des amis
              <ArrowUpRight size={15} />
            </button>
          </div>

          <div className="game-layout">
            <div className="main-column">
              <section className="table-panel" aria-label="Table de blackjack">
                <div className="table-toolbar">
                  <div className="table-identity">
                    <span
                      className={`connection-dot ${connected ? "online" : ""}`}
                    />
                    <b>TABLE {state?.id ?? "MINUIT"}</b>
                    <span className="table-separator">/</span>
                    <span>5 – 500 crédits</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setModal("tables")}
                  >
                    <Users size={14} />
                    {state?.players.filter((p) => p.connected).length ?? 0}
                    <span>/ 5 places</span>
                    <ChevronDown size={13} />
                  </button>
                </div>
                <div className="table-stage">
                  <div className="ambient-glow" />
                  <div className="table-surface">
                    <div className="felt-texture" />
                    <div className="table-inner-line" />
                    <div className="table-inner-line second" />
                  </div>
                  <div className="dealer">
                    <div className="dealer-label">
                      <span />
                      CROUPIER
                      <span />
                    </div>
                    <div className="dealer-cards">
                      {state?.dealer.length ? (
                        state.dealer.map((card, i) => (
                          <PlayingCard key={card.id} card={card} index={i} />
                        ))
                      ) : (
                        <>
                          <div className="card-outline">
                            <Spade size={20} />
                          </div>
                          <div className="card-outline" />
                        </>
                      )}
                    </div>
                    {!!state?.dealer.length && (
                      <div className="dealer-score">
                        {score(state.dealer).total}
                        {state.phase === "playing" || state.phase === "dealing"
                          ? " visible"
                          : ""}
                      </div>
                    )}
                  </div>
                  <div className="card-shoe">
                    <div />
                    <div />
                    <PlayingCard back decorative />
                    <ShoeShuffleAnimation active={shoeShuffling} />
                    <span>8 JEUX</span>
                  </div>
                  <div className="felt-brand">
                    <span className="felt-diamond">✧</span>
                    <h2>MINUIT</h2>
                    <p>BLACKJACK PAYS 3 TO 2</p>
                    <div>
                      <span>21 + 3</span>
                      <i />
                      SUPER PAIRS
                    </div>
                  </div>
                  {(state?.seats ?? EMPTY_SEATS).map((s) => (
                    <SeatView
                      key={s.index}
                      seat={s}
                      state={state}
                      playerId={playerId}
                      selected={s.index === seat?.index}
                      onSelect={() => selectSeat(s)}
                      onBet={(type) => placeBet(s, type)}
                      chip={chip}
                      disabled={disabled}
                    />
                  ))}
                  <div className="felt-bottom-caption">
                    LE CROUPIER RESTE SUR TOUS LES 17
                  </div>
                  {((roundResult && roundResult.net > 0) ||
                    (state?.phase === "bonuses" && myBonus > 0)) && (
                    <div
                      className="win-burst"
                      key={`${state?.round}-${state?.phase}`}
                      aria-hidden="true"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <i key={i} style={{ "--i": i } as CSSProperties} />
                      ))}
                    </div>
                  )}
                  {ownGamble &&
                    (gambleOpen ? (
                      <div className="table-gamble-overlay">
                        <GamblePanel
                          gamble={ownGamble}
                          disabled={disabled}
                          onGamble={gamble}
                          onCashout={cashout}
                          onClose={() => {
                            setGambleOpen(false);
                            setGamblePromptFeatured(false);
                          }}
                        />
                      </div>
                    ) : ownGamble.status === "available" ? (
                      <div
                        className={`table-gamble-prompt-anchor table-gamble-prompt-edge ${gamblePromptFeatured ? "is-featured" : "is-compact"}`}
                      >
                        <GamblePrompt
                          stake={ownGamble.stake}
                          disabled={disabled}
                          compact={!gamblePromptFeatured}
                          onOpen={() => setGambleOpen(true)}
                        />
                      </div>
                    ) : null)}
                </div>
                <div className="table-status" aria-live="polite">
                  <span className={`status-orb ${myTurn ? "your-turn" : ""}`} />
                  {!profile
                    ? "Votre place vous attend."
                    : !connected
                      ? "Connexion à la table…"
                      : (state?.message ?? "Bienvenue à la table.")}
                  {seconds !== null && (
                    <span className="countdown">{seconds}s</span>
                  )}
                  <span className="round-number">
                    MANCHE {String(state?.round ?? 0).padStart(3, "0")}
                  </span>
                </div>
                <div
                  className={`controls-panel ${myTurn ? "controls-active" : ""}`}
                  aria-label="Actions de jeu"
                >
                  <div className="controls-heading">
                    <div>
                      <span className="section-kicker">
                        {betting
                          ? "À VOUS DE MISER"
                          : myTurn
                            ? `MAIN ${(activeSeat?.index ?? 0) + 1} · ${activeHand ? score(activeHand.cards).total : ""} POINTS`
                            : "LA PARTIE CONTINUE"}
                      </span>
                      <h2>
                        {subtitle}
                        {roundResult && (
                          <span
                            className={`round-net ${roundResult.net >= 0 ? "positive" : "negative"}`}
                          >
                            {roundResult.net > 0 ? "+" : ""}
                            {credits(roundResult.net)} cr.
                          </span>
                        )}
                      </h2>
                    </div>
                    {betting && (
                      <span className="selected-hand-label">
                        {seat ? `Main ${seat.index + 1}` : "Spectateur"}
                        {ownSeats.length > 1 && (
                          <span> / {ownSeats.length} mains</span>
                        )}
                      </span>
                    )}
                    {!betting && seconds !== null && (
                      <span className="turn-clock">
                        {seconds}
                        <small>SEC</small>
                      </span>
                    )}
                  </div>
                  <AnimatedMenu active={betting} className="betting-actions">
                    {betting ? (
                      <>
                        <div className="chip-rack">
                          <div className="chip-picker">
                            {[5, 25, 50, 100].map((amount) => (
                              <Chip
                                key={amount}
                                amount={amount}
                                selected={chip === amount}
                                disabled={disabled || !!me?.ready}
                                onClick={() => setChip(amount)}
                              />
                            ))}
                            <span className="rack-divider" />
                            <button
                              className="icon-button undo-bet"
                              disabled={
                                disabled || !betHistory.length || !!me?.ready
                              }
                              onClick={undoBet}
                              title="Annuler le dernier jeton"
                              aria-label="Annuler le dernier jeton"
                            >
                              <RotateCcw size={17} />
                            </button>
                            <HoldToConfirmButton
                              disabled={disabled || !totalBet || !!me?.ready}
                              onConfirm={clearBets}
                              title="Maintenir pour retirer toutes vos mises"
                              ariaLabel="Maintenir pour retirer toutes vos mises"
                            >
                              <X size={17} />
                            </HoldToConfirmButton>
                          </div>
                          <span className="chip-rack-hint">
                            Jeton de <b>{chip}</b> sélectionné · cliquez sur le
                            tapis pour miser
                          </span>
                        </div>
                        <div className="bet-confirm">
                          <span>
                            MISE TOTALE
                            <b>
                              {credits(totalBet)} <small>cr.</small>
                            </b>
                          </span>
                          {balance < 5 ? (
                            <button
                              className="button primary"
                              onClick={() => command({ type: "refill" })}
                              disabled={disabled}
                            >
                              <Coins size={16} />
                              Recharger
                            </button>
                          ) : (
                            <button
                              className={`button primary deal-button ${me?.ready ? "is-ready" : ""}`}
                              disabled={disabled || totalBet === 0}
                              onClick={() =>
                                command({ type: "ready", ready: !me?.ready })
                              }
                            >
                              {me?.ready ? (
                                <>
                                  <Check size={18} />
                                  Prêt · annuler
                                </>
                              ) : (
                                <>
                                  Je suis prêt
                                  <ArrowRight size={18} />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </>
                    ) : null}
                  </AnimatedMenu>
                  {betting && (
                    <div className="controls-footnote">
                      <span>
                        <ShieldCheck size={12} />
                        Misez directement sur Blackjack, 21+3 ou Super Pairs.
                      </span>
                      {seat && (
                        <button
                          className="text-button"
                          disabled={disabled}
                          title="Annuler votre place et retirer ses mises"
                          onClick={() => {
                            void command({
                              type: "release",
                              seat: seat.index,
                            }).then((ok) => {
                              if (ok) setBetHistory([]);
                            });
                          }}
                        >
                          Libérer cette place
                        </button>
                      )}
                    </div>
                  )}
                  <AnimatedMenu
                    active={!!myTurn && !!activeHand}
                    className="play-actions"
                  >
                    {myTurn && activeHand ? (
                      <>
                        <button
                          className="button hit-button"
                          disabled={disabled}
                          onClick={() =>
                            command({ type: "hit", handId: activeHand.id })
                          }
                        >
                          <Plus size={20} />
                          <span>
                            Carte<small>Tirer une carte</small>
                          </span>
                        </button>
                        <button
                          className="button stand-button"
                          disabled={disabled}
                          onClick={() =>
                            command({ type: "stand", handId: activeHand.id })
                          }
                        >
                          <Minus size={20} />
                          <span>
                            Rester<small>Garder votre main</small>
                          </span>
                        </button>
                        <div
                          className={`double-action ${doubleChoice === activeHand.id && !doubleChoiceClosing ? "choice-open" : ""}`}
                        >
                          <button
                            className="button secondary double-trigger"
                            disabled={
                              disabled ||
                              activeHand.cards.length !== 2 ||
                              activeHand.splitAces ||
                              balance < activeHand.bet
                            }
                            aria-haspopup="menu"
                            aria-expanded={
                              doubleChoice === activeHand.id &&
                              !doubleChoiceClosing
                            }
                            onClick={() => {
                              if (doubleChoice === activeHand.id) {
                                closeDoubleChoice();
                                return;
                              }
                              if (doubleCloseTimer.current !== null) {
                                window.clearTimeout(doubleCloseTimer.current);
                                doubleCloseTimer.current = null;
                              }
                              setDoubleChoiceClosing(false);
                              setDoubleChoice(activeHand.id);
                            }}
                          >
                            <span className="double-icon">×2</span>
                            <span>
                              Doubler<small>Choisir la révélation</small>
                            </span>
                            <ChevronDown className="double-chevron" size={14} />
                          </button>
                          {doubleChoice === activeHand.id && (
                            <div
                              className={`double-choice-menu ${doubleChoiceClosing ? "is-closing" : ""}`}
                              role="menu"
                              aria-label="Révélation de la carte doublée"
                            >
                              <button
                                role="menuitem"
                                onClick={() => {
                                  closeDoubleChoice();
                                  void command({
                                    type: "double",
                                    handId: activeHand.id,
                                    reveal: "now",
                                  });
                                }}
                              >
                                <Eye size={17} />
                                <span>
                                  Carte visible
                                  <small>Révélée immédiatement</small>
                                </span>
                              </button>
                              <button
                                role="menuitem"
                                onClick={() => {
                                  closeDoubleChoice();
                                  void command({
                                    type: "double",
                                    handId: activeHand.id,
                                    reveal: "dealer",
                                  });
                                }}
                              >
                                <EyeOff size={17} />
                                <span>
                                  Carte cachée
                                  <small>Après le croupier</small>
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          className="button secondary"
                          disabled={
                            disabled ||
                            !canSplitCards(activeHand.cards) ||
                            activeHand.splitAces ||
                            (activeSeat?.hands.length ?? 0) >= 4 ||
                            balance < activeHand.bet
                          }
                          onClick={() =>
                            command({ type: "split", handId: activeHand.id })
                          }
                        >
                          <Layers2 size={19} />
                          <span>
                            Séparer<small>Deux mains</small>
                          </span>
                        </button>
                      </>
                    ) : null}
                  </AnimatedMenu>
                  {!betting && !(myTurn && activeHand) && (
                    <div className="waiting-state">
                      {state?.phase === "settled" ? (
                        <>
                          <span
                            className={`result-symbol ${roundResult && roundResult.net > 0 ? "positive" : ""}`}
                          >
                            {roundResult && roundResult.net > 0 ? (
                              <Sparkles size={25} />
                            ) : (
                              <Spade size={25} />
                            )}
                          </span>
                          <div>
                            <b>
                              {roundResult
                                ? roundResult.net > 0
                                  ? "La nuit vous sourit."
                                  : roundResult.net === 0
                                    ? "On remet ça ?"
                                    : "La prochaine sera peut-être la vôtre."
                                : "La prochaine manche vous attend."}
                            </b>
                            <p>
                              Les mises rouvrent dans {seconds ?? 0} secondes.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <LoaderCircle className="spinner" size={24} />
                          <div>
                            <b>
                              {state?.phase === "playing"
                                ? `${state.players.find((p) => p.id === activeSeat?.playerId)?.name ?? "Un joueur"} prend sa décision.`
                                : state?.phase === "bonuses"
                                  ? myBonus > 0
                                    ? `+${credits(myBonus)} crédits versés sur votre solde.`
                                    : "Pas de combinaison gagnante cette fois-ci."
                                  : state?.phase === "dealer"
                                    ? "Le croupier révèle sa main."
                                    : "Un peu de suspense…"}
                            </b>
                            <p>
                              {state?.phase === "bonuses"
                                ? "Les gains annexes sont payés avant de jouer vos mains."
                                : ownSeats.length
                                  ? "Toutes vos mains se jouent l’une après l’autre."
                                  : "Vous pourrez prendre une place à la prochaine manche."}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>

      {notice && (
        <div
          className={`toast ${notice.error ? "error-toast" : ""} ${notice.visible ? "is-visible" : "is-closing"}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <CircleHelp size={17} /> : <Check size={17} />}
          <span>{notice.message}</span>
          <button
            className="icon-button"
            onClick={() => {
              game.setError("");
              setToast("");
            }}
            aria-label="Fermer la notification"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {loaded && !profile && (
        <Modal title="Bienvenue chez Minuit" className="welcome-modal">
          <div className="welcome-art">
            <div className="welcome-halo" />
            <PlayingCard
              card={{ id: "welcome1", rank: 1, suit: "spades" }}
              decorative
            />
            <PlayingCard
              card={{ id: "welcome2", rank: 13, suit: "hearts" }}
              decorative
            />
            <span className="floating-star star-one">✦</span>
            <span className="floating-star star-two">✧</span>
            <span className="welcome-art-tag">
              <Coins size={13} />2 000 crédits offerts
            </span>
          </div>
          <div className="welcome-content">
            <span className="section-kicker">BIENVENUE CHEZ MINUIT</span>
            <h2>
              La soirée commence
              <br />
              avec vous.
            </h2>
            <p>
              Choisissez un pseudo, prenez place.
              <br />
              On s’occupe des cartes.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) game.register(name);
              }}
            >
              <label htmlFor="player-name">Votre pseudo</label>
              <input
                autoFocus
                id="player-name"
                placeholder="Comment vous appelle-t-on ?"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={1}
                maxLength={18}
                required
                autoComplete="nickname"
              />
              <button
                className="button primary"
                type="submit"
                disabled={!name.trim()}
              >
                Entrer dans le club
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="welcome-note">
              <ShieldCheck size={13} />
              Sans inscription. Uniquement des crédits fictifs.
            </div>
          </div>
        </Modal>
      )}

      {modal === "rules" && (
        <Modal
          title="Règles du jeu"
          onClose={() => setModal(null)}
          className="rules-modal"
        >
          <span className="section-kicker">LES RÈGLES DE LA TABLE</span>
          <h2>Tout se joue à 21.</h2>
          <p className="modal-intro">
            Blackjack européen · 8 jeux de 52 cartes · Mises de 5 à 500 crédits.
          </p>
          <div className="rule-grid">
            <div>
              <Spade size={20} />
              <h3>Le plus près de 21</h3>
              <p>
                Battez le croupier sans dépasser 21. Les figures valent 10, l’as
                vaut 1 ou 11. Un blackjack naturel rapporte 3:2 ; une victoire,
                1:1. L’égalité rembourse la mise.
              </p>
            </div>
            <div>
              <Layers2 size={20} />
              <h3>À l’européenne</h3>
              <p>
                Le croupier reçoit sa deuxième carte après tous les joueurs et
                reste sur 17, même souple. Son blackjack fait perdre toutes les
                mises, doubles et séparations compris, sauf un blackjack naturel
                à égalité.
              </p>
            </div>
            <div>
              <Plus size={20} />
              <h3>Double ou séparation</h3>
              <p>
                Doublez sur vos deux premières cartes, même après séparation.
                Séparez deux cartes de même rang jusqu’à 4 mains par place. Les
                as séparés ne reçoivent qu’une carte, sans nouvelle séparation.
                Un 21 après séparation paie 1:1.
              </p>
            </div>
            <div>
              <Users size={20} />
              <h3>En bonne compagnie</h3>
              <p>
                Prenez plusieurs des 5 places disponibles. Choisissez un jeton,
                puis cliquez directement sur les zones du tapis pour miser.
                Validez avec « Je suis prêt ». Les joueurs non prêts attendent
                la manche suivante. Vous avez 25 secondes par décision, puis
                votre main reste automatiquement.
              </p>
            </div>
          </div>
          <div className="rules-sidebets">
            <Paytable kind="three" expanded />
            <Paytable kind="pairs" expanded />
          </div>
          <p className="rules-note">
            Les cotes indiquent le gain net : à 9:1, une mise de 5 rapporte 45 +
            les 5 misés. Les paris annexes sont payés dès la distribution, avant
            le premier choix d’action. Ils sont indépendants du blackjack et
            limités à 100 crédits chacun. Un gain net peut ensuite être tenté
            autant de fois que vous le souhaitez sur rouge ou noir : chaque
            bonne carte double le montant, une mauvaise carte arrête la série.
            Vous pouvez encaisser quand vous voulez. Pas d’assurance ni
            d’abandon. Votre profil est sauvegardé sur cet appareil ; les tables
            sont conservées en mémoire tant que le serveur fonctionne.
          </p>
          <button className="button primary" onClick={() => setModal(null)}>
            À la table
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}

      {modal === "tables" && (
        <Modal title="Retrouver votre table" onClose={() => setModal(null)}>
          <span className="modal-emblem">
            <Users size={26} />
          </span>
          <span className="section-kicker">ENSEMBLE, C’EST MIEUX</span>
          <h2>Votre cercle. Votre table.</h2>
          <p className="modal-intro">
            Retrouvez une table publique, ou créez votre espace et partagez le
            lien à vos amis.
          </p>
          <div className="public-table-section">
            <span className="table-list-heading">TABLES PUBLIQUES</span>
            <div className="public-table-list">
              {PUBLIC_TABLES.map((publicTable) => {
                const current = state?.id === publicTable.id;
                const playerCount = current
                  ? state.players.filter((player) => player.connected).length
                  : null;
                return (
                  <button
                    key={publicTable.id}
                    type="button"
                    className={`public-table-option ${current ? "current" : ""}`}
                    disabled={!connected || !canChangeTable || current}
                    onClick={() => {
                      game.changeTable(publicTable.id);
                      setModal(null);
                    }}
                    aria-current={current ? "page" : undefined}
                    aria-label={`Rejoindre la table publique ${publicTable.label}`}
                  >
                    <span className="public-table-status" aria-hidden="true">
                      <i />
                    </span>
                    <span className="public-table-copy">
                      <b>{publicTable.label}</b>
                      <small>
                        {current
                          ? `${playerCount} / 5 joueurs`
                          : publicTable.description}
                      </small>
                    </span>
                    {current ? <Check size={15} /> : <ArrowRight size={15} />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="or-divider">
            <span />
            OU PRIVÉE
            <span />
          </div>
          <button
            className="button primary full-width"
            disabled={!connected || !canChangeTable}
            onClick={() => {
              const code = newToken()
                .replace(/-/g, "")
                .slice(0, 6)
                .toUpperCase();
              game.changeTable(code);
              setModal(null);
            }}
          >
            <Plus size={17} />
            Créer une table privée
          </button>
          <div className="or-divider">
            <span />
            OU REJOINDRE
            <span />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              game.changeTable(tableCode.trim().toUpperCase());
              setModal(null);
            }}
          >
            <label htmlFor="table-code">Code de la table</label>
            <div className="join-input">
              <input
                id="table-code"
                placeholder="Ex. A7C2F1"
                value={tableCode}
                onChange={(event) =>
                  setTableCode(event.target.value.toUpperCase())
                }
                pattern="[A-Z0-9]{4,12}"
                maxLength={12}
                minLength={4}
                required
              />
              <button
                className="button secondary"
                disabled={!connected || !canChangeTable}
              >
                Rejoindre
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
          {!canChangeTable && (
            <p className="rules-note">
              Vous pourrez changer de table à la fin de cette manche.
            </p>
          )}
          <button
            className="text-button public-table-link"
            disabled={!connected || !canChangeTable}
            onClick={() => {
              game.changeTable(DEFAULT_PUBLIC_TABLE_ID);
              setModal(null);
            }}
          >
            Revenir à la table publique {DEFAULT_PUBLIC_TABLE_ID}
            <ArrowUpRight size={14} />
          </button>
        </Modal>
      )}

      {modal === "history" && (
        <Modal title="Votre historique" onClose={() => setModal(null)}>
          <span className="section-kicker">LES SOUVENIRS DE LA SOIRÉE</span>
          <h2>Vos dernières manches.</h2>
          <p className="modal-intro">
            Résultats nets, toutes vos mains et paris annexes inclus. Historique
            de cette table, conservé pendant la session serveur.
          </p>
          {myHistory.length ? (
            <>
              <div
                className="history-session-summary"
                aria-label="Bilan de la session"
              >
                <span className={`history-session-icon ${netTone(sessionNet)}`}>
                  {sessionNet > 0 ? (
                    <ArrowUpRight size={18} />
                  ) : sessionNet < 0 ? (
                    <ArrowDownLeft size={18} />
                  ) : (
                    <Minus size={18} />
                  )}
                </span>
                <span className="history-session-copy">
                  <b>Bilan de la session</b>
                  <small>
                    {myHistory.length} manche{myHistory.length > 1 ? "s" : ""}{" "}
                    comptabilisée{myHistory.length > 1 ? "s" : ""}
                  </small>
                </span>
                <strong className={netTone(sessionNet)}>
                  {formatNet(sessionNet)} <small>cr.</small>
                </strong>
              </div>
              <div className="history-list">
                {myHistory.map((item) => (
                  <div className="history-entry" key={item.round}>
                    <div className="history-entry-heading">
                      <span
                        className={`history-icon ${item.net >= 0 ? "positive" : "negative"}`}
                      >
                        {item.net >= 0 ? (
                          <ArrowUpRight size={18} />
                        ) : (
                          <ArrowDownLeft size={18} />
                        )}
                      </span>
                      <span>
                        <b>Manche {String(item.round).padStart(3, "0")}</b>
                        <small>
                          {new Date(item.timestamp).toLocaleTimeString(
                            "fr-FR",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </small>
                      </span>
                      <strong className={netTone(item.net)}>
                        {formatNet(item.net)} cr.
                      </strong>
                    </div>
                    <div
                      className="history-breakdown"
                      aria-label={`Détail des mises de la manche ${item.round}`}
                    >
                      {item.bets.map((bet, index) => {
                        const delta = bet.net;
                        const deltaLabel =
                          bet.result === "none" ? "—" : formatNet(delta);
                        return (
                          <div
                            className={`history-bet ${bet.result}`}
                            key={`${bet.type}-${bet.seat}-${index}`}
                          >
                            <span className="history-bet-name">
                              <b>{labels[bet.type]}</b>
                              <small>
                                Main {bet.seat + 1} ·{" "}
                                {historyResultLabels[bet.result]}
                                {bet.label ? ` · ${bet.label}` : ""}
                              </small>
                            </span>
                            <span className="history-bet-return">
                              {bet.bet > 0
                                ? `Mise ${credits(bet.bet)} · Retour ${credits(bet.payout)}`
                                : "Aucune mise"}
                            </span>
                            <strong
                              className={
                                bet.result === "none" ? "muted" : netTone(delta)
                              }
                            >
                              {deltaLabel}
                            </strong>
                          </div>
                        );
                      })}
                      {item.gambles?.map((entry, index) => (
                        <div
                          className={`history-bet gamble-history ${entry.result}`}
                          key={`gamble-${index}`}
                        >
                          <span className="history-bet-name">
                            <b>
                              Gamble ·{" "}
                              {entry.choice === "red" ? "Rouge" : "Noir"}
                            </b>
                            <small>
                              Carte {rankLabel(entry.card.rank)}{" "}
                              {SUITS[entry.card.suit]} ·{" "}
                              {entry.result === "win" ? "Gagné" : "Perdu"}
                            </small>
                          </span>
                          <span className="history-bet-return">
                            {entry.result === "win"
                              ? `Gain doublé · ${credits(entry.stake)} cr.`
                              : `Gain perdu · ${credits(entry.stake)} cr.`}
                          </span>
                          <strong className={netTone(entry.net)}>
                            {formatNet(entry.net)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="history-empty">
              <History size={34} />
              <b>Votre histoire reste à écrire.</b>
              <p>Jouez une première manche pour la retrouver ici.</p>
            </div>
          )}
        </Modal>
      )}

      {modal === "invite" && (
        <Modal title="Inviter des amis" onClose={() => setModal(null)}>
          <span className="section-kicker">UNE PLACE POUR VOS AMIS</span>
          <h2>Partagez la soirée.</h2>
          <p className="modal-intro">
            Envoyez ce lien aux personnes que vous voulez retrouver à votre
            table.
          </p>
          <label htmlFor="invite-url">Lien de la table {state?.id}</label>
          <input
            id="invite-url"
            readOnly
            value={shareUrl()}
            onFocus={(event) => event.target.select()}
          />
          <p className="rules-note">
            Sur votre réseau local, remplacez « localhost » par l’adresse IP de
            l’ordinateur qui héberge la partie. En ligne, partagez l’adresse du
            serveur déployé.
          </p>
        </Modal>
      )}
    </div>
  );
}

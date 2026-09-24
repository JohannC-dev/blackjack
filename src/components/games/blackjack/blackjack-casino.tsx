"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Castle,
  Check,
  ChevronDown,
  CircleHelp,
  Coins,
  Disc3,
  Diamond,
  Eye,
  EyeOff,
  History,
  House,
  Layers2,
  LogOut,
  Maximize2,
  Minus,
  Minimize2,
  Plus,
  Repeat2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Spade,
  Users,
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
import {
  BLACKJACK_CHIP_PRESETS,
  BLACKJACK_MAX_BET,
  BLACKJACK_MAX_SIDE_BET,
  INITIAL_CREDIT_BALANCE,
  chipLabel,
  addBetChip,
  copyBetChips,
  emptyBetChips,
} from "@/lib/chips";
import {
  REFERRAL_WELCOME_BALANCE,
  REFERRAL_WELCOME_BONUS,
} from "@/lib/referral";
import { normalizeFriendCode } from "@/lib/social";
import { playCasinoSound, preloadCasinoSounds } from "@/lib/casino-audio";
import { useGameAudio } from "@/lib/audio-context";
import type {
  Bet,
  BetChips,
  GambleColor,
  GambleState,
  Hand,
  PublicPlayer,
  Seat,
  TableState,
} from "@/lib/types";
import { useGame } from "@/lib/use-game";
import { CasinoRail, ClubHeader } from "../../ui";
import type { CasinoView } from "@/lib/navigation";
import { CountdownText } from "../../ui/countdown";
import { Chip } from "../../ui/chip";
import {
  affordableChipInPage,
  ChipSlider,
  chipPageForBalance,
} from "../../ui/game-controls";
import { Modal } from "../../ui/modal";
import { motionDuration } from "../../ui/motion";
import { PlayingCard } from "../../ui/playing-card";
import { tableCardBack } from "@/lib/cosmetics";
import { useTableSkins } from "@/lib/cosmetics-api";
import {
  AnimatedTableChip,
  SettlementChipAnimation,
} from "../../ui/table-chips";
import { PokerShuffleAnimation } from "../../ui/poker-shuffle";
import { EmoteButton, EmoteLayer, type EmotePlayer } from "../../ui/emotes";
import type { EmoteRequest } from "@/lib/emotes";

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
  chips: emptyBetChips(),
  previousChips: null,
  previousBet: null,
  hands: [],
  sides: { three: null, pairs: null },
  committed: 0,
  insurance: 0,
  insuranceDecision: false,
}));
const POSITIONS = [
  { x: 12, y: 49 },
  { x: 30, y: 66 },
  { x: 50, y: 72 },
  { x: 70, y: 66 },
  { x: 88, y: 49 },
];
const labels = {
  main: "Blackjack",
  three: "21 + 3",
  pairs: "Super Pairs",
  insurance: "Assurance",
};
const historyResultLabels = {
  win: "Gagné",
  lose: "Perdu",
  push: "Égalité",
  blackjack: "Blackjack",
  none: "Pas de mise",
};

function formatNet(value: number) {
  if (value > 0) return `+${credits(value)}`;
  if (value < 0) return `−${credits(Math.abs(value))}`;
  return credits(0);
}

function netTone(value: number) {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
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

function HandView({
  hand,
  active,
  backSkin,
}: {
  hand: Hand;
  active: boolean;
  backSkin: string | null;
}) {
  const concealed = hand.cards.some((card) => card.hidden);
  const value = score(hand.cards.filter((card) => !card.hidden));
  return (
    <div
      className={`hand ${hand.split ? "split-hand" : ""} ${active ? "active-hand" : ""} ${hand.result === "win" || hand.result === "blackjack" ? "winning-hand" : ""}`}
    >
      <div className="hand-cards">
        {hand.cards.map((card, index) => (
          <PlayingCard
            key={card.id}
            card={card}
            index={index}
            backSkin={backSkin}
          />
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
              : `+${credits(hand.payout ?? 0)}`}
        </span>
      )}
    </div>
  );
}

function BlackjackMainBetChips({ seat }: { seat: Seat }) {
  const baseBet = seat.bet.main;
  if (baseBet <= 0) return null;

  const groups = seat.hands.length
    ? seat.hands.map((hand) => ({
        id: hand.id,
        amount: baseBet,
        stacks: Math.max(1, Math.round(hand.bet / baseBet)),
      }))
    : [{ id: `seat-${seat.index}`, amount: baseBet, stacks: 1 }];

  return (
    <span
      className={`blackjack-main-bet-chips ${groups.length > 1 ? "is-split" : ""}`}
      data-hand-count={groups.length}
      data-stack-count={groups.reduce((sum, group) => sum + group.stacks, 0)}
      aria-hidden="true"
    >
      {groups.map((group, handIndex) => (
        <span
          className={`blackjack-bet-group ${group.stacks > 1 ? "is-doubled" : ""}`}
          data-hand-index={handIndex}
          data-stack-count={group.stacks}
          key={group.id}
        >
          {Array.from({ length: group.stacks }, (_, stackIndex) => (
            <AnimatedTableChip
              amount={group.amount}
              maximum={BLACKJACK_MAX_BET}
              chips={seat.chips.main}
              className="blackjack-bet-chip"
              placeholder={null}
              key={`${group.id}-${stackIndex}`}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

function BlackjackMainSettlement({ seat }: { seat: Seat }) {
  if (!seat.hands.length) return null;

  return (
    <span
      className={`blackjack-main-settlement ${seat.hands.length > 1 ? "is-split" : ""}`}
      data-hand-count={seat.hands.length}
      aria-hidden="true"
    >
      {seat.hands.map((hand) => (
        <span className="blackjack-settlement-group" key={hand.id}>
          <SettlementChipAnimation
            stake={hand.bet}
            stakeChips={seat.chips.main.map((chip) => ({
              ...chip,
              count:
                chip.count * Math.max(1, Math.round(hand.bet / seat.bet.main)),
            }))}
            payout={hand.payout ?? 0}
            maximum={BLACKJACK_MAX_BET}
          />
        </span>
      ))}
    </span>
  );
}

type SeatViewProps = {
  seat: Seat;
  owner?: PublicPlayer;
  phase: TableState["phase"] | null;
  activeHandId: string | null;
  playerSeatCount: number;
  playerId: string;
  selected: boolean;
  onSelect: (seat: Seat) => void;
  onBet: (seat: Seat, type: keyof Bet) => void;
  onRelease: (seat: Seat) => void;
  chip: number;
  disabled: boolean;
  /** Back of this seat's hidden (doubled) cards, frozen for the round. */
  backSkin: string | null;
};

function sameHand(left: Hand, right: Hand) {
  return (
    left.id === right.id &&
    left.bet === right.bet &&
    left.status === right.status &&
    left.split === right.split &&
    left.splitAces === right.splitAces &&
    left.doubleCardHidden === right.doubleCardHidden &&
    left.result === right.result &&
    left.payout === right.payout &&
    left.cards.length === right.cards.length &&
    left.cards.every((card, index) => {
      const other = right.cards[index];
      return (
        card.id === other.id &&
        card.rank === other.rank &&
        card.suit === other.suit &&
        card.hidden === other.hidden
      );
    })
  );
}

function sameSide(left: Seat["sides"]["three"], right: Seat["sides"]["three"]) {
  return (
    left?.label === right?.label &&
    left?.odds === right?.odds &&
    left?.payout === right?.payout
  );
}

function sameSeat(left: Seat, right: Seat) {
  return (
    left.index === right.index &&
    left.playerId === right.playerId &&
    left.bet.main === right.bet.main &&
    left.bet.three === right.bet.three &&
    left.bet.pairs === right.bet.pairs &&
    left.insurance === right.insurance &&
    left.insuranceDecision === right.insuranceDecision &&
    left.hands.length === right.hands.length &&
    left.hands.every((hand, index) => sameHand(hand, right.hands[index])) &&
    sameSide(left.sides.three, right.sides.three) &&
    sameSide(left.sides.pairs, right.sides.pairs)
  );
}

function sameOwner(
  left: PublicPlayer | undefined,
  right: PublicPlayer | undefined,
) {
  return (
    left?.id === right?.id &&
    left?.name === right?.name &&
    left?.ready === right?.ready &&
    left?.connected === right?.connected
  );
}

// Socket snapshots intentionally clone every seat, so reference equality
// would make an unrelated wager redraw the whole table.
function areSeatViewPropsEqual(left: SeatViewProps, right: SeatViewProps) {
  return (
    sameSeat(left.seat, right.seat) &&
    sameOwner(left.owner, right.owner) &&
    left.phase === right.phase &&
    left.activeHandId === right.activeHandId &&
    left.playerSeatCount === right.playerSeatCount &&
    left.playerId === right.playerId &&
    left.selected === right.selected &&
    left.onSelect === right.onSelect &&
    left.onBet === right.onBet &&
    left.onRelease === right.onRelease &&
    left.chip === right.chip &&
    left.disabled === right.disabled &&
    left.backSkin === right.backSkin
  );
}

const SeatView = memo(function SeatView({
  seat,
  owner,
  phase,
  activeHandId,
  playerSeatCount,
  playerId,
  selected,
  onSelect,
  onBet,
  onRelease,
  chip,
  disabled,
  backSkin,
}: SeatViewProps) {
  const mine = !!owner && owner.id === playerId;
  const active = seat.hands.some((h) => h.id === activeHandId);
  const pos = POSITIONS[seat.index];
  const hasCards = seat.hands.some((h) => h.cards.length);
  const canBet = mine && phase === "betting" && !owner?.ready && !disabled;
  const sideBetsResolved =
    phase !== null && phase !== "betting" && phase !== "dealing";
  const mainStake = seat.hands.length
    ? seat.hands.reduce((sum, hand) => sum + hand.bet, 0)
    : seat.bet.main;
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
          data-hand-count={seat.hands.length}
        >
          {seat.hands.map((hand) => (
            <HandView
              key={hand.id}
              hand={hand}
              active={hand.id === activeHandId}
              backSkin={backSkin}
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
            const stake = type === "main" ? mainStake : seat.bet[type];
            const payout =
              type === "main"
                ? seat.hands.reduce((sum, hand) => sum + (hand.payout ?? 0), 0)
                : (sideResult?.payout ?? 0);
            const settling =
              stake > 0 &&
              ((type === "main" && phase === "settled") ||
                (type !== "main" && phase === "bonuses"));
            const hideResolvedSide = resolvedSideBet && phase !== "bonuses";
            const placeholder =
              type === "main" ? (
                <Plus size={19} strokeWidth={1.4} />
              ) : type === "three" ? (
                <Diamond size={13} />
              ) : (
                <Layers2 size={13} />
              );
            return (
              <button
                key={type}
                className={`table-bet-spot spot-${type} ${stake > 0 && !hideResolvedSide ? "has-chips" : ""}`}
                onClick={() => onBet(seat, type)}
                disabled={!canBet}
                aria-label={`Miser ${chip} crédits sur ${labels[type]}, main ${seat.index + 1}`}
                title={
                  canBet
                    ? `+${chip} crédits · ${labels[type]}`
                    : `${labels[type]} : ${stake} crédits`
                }
              >
                <span className="spot-label">
                  {type === "main"
                    ? "BLACKJACK"
                    : type === "three"
                      ? "21 + 3"
                      : "SUPER PAIRS"}
                </span>
                {settling ? (
                  type === "main" ? (
                    <BlackjackMainSettlement seat={seat} />
                  ) : (
                    <SettlementChipAnimation
                      stake={stake}
                      stakeChips={seat.chips[type]}
                      payout={payout}
                      maximum={BLACKJACK_MAX_SIDE_BET}
                      side
                    />
                  )
                ) : hideResolvedSide ? (
                  <span className="spot-placeholder">{placeholder}</span>
                ) : type === "main" ? (
                  stake > 0 ? (
                    <BlackjackMainBetChips seat={seat} />
                  ) : (
                    <span className="spot-placeholder">{placeholder}</span>
                  )
                ) : (
                  <AnimatedTableChip
                    amount={stake}
                    maximum={BLACKJACK_MAX_SIDE_BET}
                    chips={seat.chips[type]}
                    className="side-chip"
                    placeholder={placeholder}
                  />
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
            onClick={() => onSelect(seat)}
            aria-label={`Prendre la place ${seat.index + 1}`}
          >
            <Plus size={19} strokeWidth={1.4} />
            <span>PRENDRE PLACE</span>
          </button>
          <span className="empty-bonus-zone right">PAIRS</span>
        </div>
      ) : null}
      <div className="seat-name-row">
        <button
          className="seat-name"
          data-emote-player={owner?.id}
          onClick={() => onSelect(seat)}
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
                    {playerSeatCount > 1 ? ` · ${seat.index + 1}` : ""}
                  </small>
                )}
              </span>
              {owner.ready && phase === "betting" ? (
                <Check className="ready-mark" size={13} />
              ) : !owner.connected ? (
                <span className="offline-dot" />
              ) : null}
            </>
          ) : (
            <span className="empty-seat-label">Installez-vous</span>
          )}
        </button>
        {mine && phase === "betting" && (
          <button
            type="button"
            className="seat-release"
            disabled={disabled}
            onClick={() => onRelease(seat)}
            aria-label={`Libérer la place ${seat.index + 1}`}
            title="Libérer cette place"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
      {(seat.sides.three || seat.sides.pairs) && (
        <div className="side-win">
          <Sparkles size={10} />
          {seat.sides.three?.label || seat.sides.pairs?.label}
          {seat.sides.three && seat.sides.pairs && " + Pairs"}
        </div>
      )}
    </div>
  );
}, areSeatViewPropsEqual);

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
              Valable jusqu’au lancement de la prochaine manche.
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

type BlackjackSidebarProps = {
  onHome: () => void;
  onBlackjack: () => void;
  onMines: () => void;
  onPoker: () => void;
  onTower: () => void;
  onChicken: () => void;
  onRoulette: () => void;
  onPlinko: () => void;
  onRules: () => void;
  blackjackLabel?: string;
};

const BlackjackSidebar = memo(function BlackjackSidebar({
  onHome,
  onBlackjack,
  onMines,
  onPoker,
  onTower,
  onChicken,
  onRoulette,
  onPlinko,
  onRules,
  blackjackLabel,
}: BlackjackSidebarProps) {
  return (
    <CasinoRail
      active="blackjack"
      blackjackLabel={blackjackLabel}
      onNavigate={(view) => {
        if (view === "home") onHome();
        else if (view === "blackjack") onBlackjack();
        else if (view === "mines") onMines();
        else if (view === "poker") onPoker();
        else if (view === "tower") onTower();
        else if (view === "chicken") onChicken();
        else if (view === "roulette") onRoulette();
        else if (view === "plinko") onPlinko();
      }}
      onRules={onRules}
    />
  );
});
const BlackjackTopbar = memo(function BlackjackTopbar({
  balance,
  name,
  onSignOut,
}: {
  balance: number;
  name: string;
  onSignOut: () => Promise<void>;
}) {
  return (
    <ClubHeader balance={balance} name={name} href="/" onSignOut={onSignOut} />
  );
});
const BlackjackPageHeading = memo(function BlackjackPageHeading({
  onInvite,
}: {
  onInvite: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          LE CLUB <span>/</span> JEUX DE TABLE
        </div>
        <h1>
          Blackjack <span>Européen</span>
        </h1>
      </div>
      <button
        type="button"
        className="button secondary invite-button"
        onClick={onInvite}
      >
        <Users size={16} />
        Inviter des amis
        <ArrowUpRight size={15} />
      </button>
    </div>
  );
});

const BlackjackTableToolbar = memo(function BlackjackTableToolbar({
  connected,
  tableId,
  isFullscreen,
  seatCount,
  countdownDeadline,
  playerId,
  emotePlayers,
  onToggleFullscreen,
  onOpenTables,
  onOpenHistory,
  onSendEmote,
}: {
  connected: boolean;
  tableId: string;
  isFullscreen: boolean;
  seatCount: number;
  countdownDeadline: number | null;
  playerId: string;
  emotePlayers: EmotePlayer[];
  onSendEmote: (request: EmoteRequest) => void;
  onToggleFullscreen: () => void;
  onOpenTables: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <div className="table-toolbar">
      <div className="table-identity">
        <span className={`connection-dot ${connected ? "online" : ""}`} />
        <b>TABLE {tableId}</b>
        <span className="table-separator">/</span>
        <span className="table-description">Mises sur mesure</span>
        {countdownDeadline !== null && (
          <div className="table-round-meta" aria-label="Compte à rebours">
            <span className="table-round-countdown">
              <CountdownText deadline={countdownDeadline} suffix="" />
            </span>
          </div>
        )}
      </div>
      <div className="table-toolbar-actions">
        <EmoteButton
          game="blackjack"
          players={emotePlayers}
          playerId={playerId}
          seated={emotePlayers.some((player) => player.id === playerId)}
          onSend={onSendEmote}
        />
        <button
          type="button"
          className="poker-sound"
          aria-label="Historique"
          title="Historique"
          onClick={onOpenHistory}
        >
          <History size={16} />
        </button>
        <button
          type="button"
          className={`poker-sound table-fullscreen-button ${isFullscreen ? "active" : ""}`}
          aria-label={
            isFullscreen
              ? "Quitter le plein écran"
              : "Passer la table en plein écran"
          }
          aria-pressed={isFullscreen}
          title={
            isFullscreen
              ? "Quitter le plein écran"
              : "Passer la table en plein écran"
          }
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button className="text-button" onClick={onOpenTables}>
          <Users size={14} />
          {seatCount}
          <span>/ 5 places</span>
          <ChevronDown size={13} />
        </button>
      </div>
    </div>
  );
});

export function WelcomeAuthModal({
  game,
}: {
  game: ReturnType<typeof useGame>;
}) {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [referralCode, setReferralCode] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const handleCaptchaError = useCallback(() => {
    setCaptchaToken(null);
  }, []);
  const turnstileScriptOptions = useMemo(
    () => ({ onError: handleCaptchaError }),
    [handleCaptchaError],
  );
  const captchaRequired = !!turnstileSiteKey;

  return (
    <Modal
      title={
        authMode === "sign-in" ? "Connexion à Minuit" : "Bienvenue chez Minuit"
      }
      className="welcome-modal"
    >
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
        {authMode === "sign-up" && (
          <span className="welcome-art-tag">
            <Coins size={13} />
            {credits(
              normalizeFriendCode(referralCode)
                ? REFERRAL_WELCOME_BALANCE
                : INITIAL_CREDIT_BALANCE,
            )}{" "}
            crédits offerts
          </span>
        )}
      </div>
      <div className="welcome-content">
        <span className="section-kicker">
          {authMode === "sign-in"
            ? "CONNEXION À MINUIT"
            : "BIENVENUE CHEZ MINUIT"}
        </span>
        <h2>
          {authMode === "sign-in" ? (
            "Bon retour au club."
          ) : (
            <>
              La soirée commence
              <br />
              avec vous.
            </>
          )}
        </h2>
        <p>
          {authMode === "sign-in" ? (
            "Retrouvez votre table et vos amis."
          ) : (
            <>
              Choisissez un pseudo, prenez place.
              <br />
              On s’occupe des cartes.
            </>
          )}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (captchaRequired && !captchaToken) return;
            setAuthPending(true);
            try {
              const message = await game.register({
                mode: authMode,
                name: authMode === "sign-up" ? name : undefined,
                email,
                password,
                captchaToken:
                  captchaRequired ? (captchaToken ?? undefined) : undefined,
                referralCode:
                  authMode === "sign-up" ? referralCode : undefined,
              });
              if (message) game.setError(message);
            } catch {
              game.setError(
                "La connexion est momentanément impossible. Réessayez.",
              );
            } finally {
              setAuthPending(false);
              if (captchaRequired) {
                setCaptchaToken(null);
                turnstileRef.current?.reset();
              }
            }
          }}
        >
          {authMode === "sign-up" && (
            <>
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
            </>
          )}
          <label htmlFor="player-email">Votre email</label>
          <input
            autoFocus={authMode === "sign-in"}
            id="player-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
          <label htmlFor="player-password">Votre mot de passe</label>
          <input
            id="player-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={128}
            required
            autoComplete={
              authMode === "sign-up" ? "new-password" : "current-password"
            }
          />
          {authMode === "sign-up" && (
            <>
              <label htmlFor="player-referral">
                Code de parrainage{" "}
                <span className="welcome-optional">facultatif</span>
              </label>
              <input
                id="player-referral"
                placeholder="ABCD-EFGH"
                value={referralCode}
                onChange={(event) =>
                  setReferralCode(event.target.value.toUpperCase())
                }
                maxLength={9}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="player-referral-help"
              />
              <p id="player-referral-help" className="welcome-hint">
                {normalizeFriendCode(referralCode)
                  ? `Votre parrain vous offre ${credits(REFERRAL_WELCOME_BONUS)} crédits de plus.`
                  : "Le code d’un joueur du club, pour démarrer avec 50 % de crédits en plus."}
              </p>
            </>
          )}
          {captchaRequired && (
            <>
              <Turnstile
                ref={turnstileRef}
                siteKey={turnstileSiteKey ?? ""}
                options={{
                  action: "auth",
                  language: "fr",
                  size: "invisible",
                  theme: "dark",
                }}
                onSuccess={(token) => {
                  setCaptchaToken(token);
                }}
                onExpire={() => setCaptchaToken(null)}
                onError={handleCaptchaError}
                scriptOptions={turnstileScriptOptions}
                role="group"
                aria-label="Vérification anti-robot"
              />
            </>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={
              authPending ||
              !email.trim() ||
              password.length < 8 ||
              (captchaRequired && !captchaToken) ||
              (authMode === "sign-up" && !name.trim())
            }
          >
            {authPending
              ? authMode === "sign-in"
                ? "Connexion..."
                : "Création..."
              : authMode === "sign-up"
                ? "Créer mon compte"
                : "Se connecter"}
            <ArrowRight size={18} />
          </button>
        </form>
        {game.error && (
          <div className="welcome-error" role="alert">
            {game.error}
          </div>
        )}
        <button
          type="button"
          className="welcome-auth-switch"
          onClick={() => {
            game.setError("");
            setCaptchaToken(null);
            turnstileRef.current?.reset();
            setAuthMode((mode) =>
              mode === "sign-up" ? "sign-in" : "sign-up",
            );
          }}
        >
          {authMode === "sign-up" ? "J’ai déjà un compte" : "Créer un compte"}
        </button>
        <div className="welcome-note">
          <ShieldCheck size={13} />
          Compte protégé. Uniquement des crédits fictifs.
        </div>
      </div>
    </Modal>
  );
}

export function BlackjackCasino({
  game,
  onNavigate,
}: {
  game: ReturnType<typeof useGame>;
  onNavigate: (view: CasinoView) => void;
}) {
  const {
    state,
    playerId,
    connected,
    profile,
    command,
    joinBlackjack,
    enterBlackjack,
    leaveBlackjack,
    pending,
  } = game;
  // Backs frozen for the round: each seat's hidden doubled card wears its
  // player's, the dealer and the shoe the viewer's.
  const tableSkins = useTableSkins(
    [
      ...(state?.seats ?? EMPTY_SEATS).flatMap((seat) =>
        seat.playerId ? [seat.playerId] : [],
      ),
      playerId,
    ],
    state?.round,
  );
  const viewerBack = tableCardBack(tableSkins, null, playerId);
  const [modal, setModal] = useState<
    "rules" | "tables" | "history" | "invite" | null
  >(null);
  const [tableCode, setTableCode] = useState("");
  const [selectedSeat, setSelectedSeat] = useState(2);
  const [betHistory, setBetHistory] = useState<
    { seat: number; before: Bet; beforeChips: BetChips }[]
  >([]);
  const [chip, setChip] = useState<number>(BLACKJACK_CHIP_PRESETS[0][0]);
  const [toast, setToast] = useState("");
  const [notice, setNotice] = useState<{
    message: string;
    error: boolean;
    visible: boolean;
  } | null>(null);
  const { enabled: sound, contextRef: audioRef } =
    useGameAudio(preloadCasinoSounds);
  const [doubleChoice, setDoubleChoice] = useState<string | null>(null);
  const [doubleChoiceClosing, setDoubleChoiceClosing] = useState(false);
  const [gambleOpen, setGambleOpen] = useState(false);
  const [gamblePromptFeatured, setGamblePromptFeatured] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const previousCards = useRef(0);
  const previousOwnBet = useRef(0);
  const hasSeenOwnBet = useRef(false);
  const previousOwnBalance = useRef(0);
  const hasSeenOwnBalance = useRef(false);
  const doubleCloseTimer = useRef<number | null>(null);
  const noticeCloseTimer = useRef<number | null>(null);
  const chipInitialized = useRef(false);
  const me = state?.players.find((p) => p.id === playerId);
  // Seated players, keyed by a signature so the memoised toolbar stays stable.
  const emoteSignature = JSON.stringify(
    [...new Set(state?.seats.map((s) => s.playerId))]
      .filter((id): id is string => !!id)
      .map((id) => ({
        id,
        name: state?.players.find((p) => p.id === id)?.name ?? "",
      })),
  );
  const emotePlayers = useMemo<EmotePlayer[]>(
    () => JSON.parse(emoteSignature),
    [emoteSignature],
  );
  const ownSeats = state?.seats.filter((s) => s.playerId === playerId) ?? [];
  const seat = ownSeats.find((s) => s.index === selectedSeat) ?? ownSeats[0];
  const insuranceSeat =
    state?.phase === "insurance"
      ? ownSeats.find((s) => s.hands.length > 0 && !s.insuranceDecision)
      : undefined;
  const balance =
    game.balance ?? me?.balance ?? profile?.balance ?? INITIAL_CREDIT_BALANCE;
  const chipBalance = game.balance ?? me?.balance ?? profile?.balance ?? 0;
  const betting = !state || state.phase === "betting";
  const canChangeTable = betting || ownSeats.length === 0;
  const currentPublicTable = state?.visibility === "public";
  const publicPlayerCount =
    state?.seats.filter((target) => target.playerId).length ?? 0;
  const totalBet = ownSeats.reduce((sum, s) => sum + betTotal(s.bet), 0);
  const previousBetTotal = ownSeats.reduce(
    (sum, s) => sum + (s.previousBet ? betTotal(s.previousBet) : 0),
    0,
  );
  const activeSeat = state?.seats.find((s) =>
    s.hands.some((h) => h.id === state.activeHandId),
  );
  const activeHand = activeSeat?.hands.find(
    (h) => h.id === state?.activeHandId,
  );
  const myTurn =
    state?.phase === "playing" && activeSeat?.playerId === playerId;
  const showControlsPanel =
    betting || !!insuranceSeat || (!!myTurn && !!activeHand);
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
  const roundBetNet =
    roundResult?.bets.reduce((sum, bet) => sum + bet.net, 0) ?? 0;
  const roundPayout =
    roundResult?.bets.reduce((sum, bet) => sum + bet.payout, 0) ?? 0;
  const showCenterSettlement = state?.phase === "settled" && !!roundResult;
  const mainWinNet =
    state?.phase === "settled"
      ? (roundResult?.bets.reduce(
          (sum, bet) =>
            sum + (bet.type === "main" && bet.net > 0 ? bet.net : 0),
          0,
        ) ?? 0)
      : 0;
  const ownGambles =
    state?.gambles.filter((entry) => entry.playerId === playerId) ?? [];
  const ownGamble = ownGambles
    .filter((entry) => entry.round === state?.round)
    .at(-1);
  const ownWinEvent =
    (state?.phase === "bonuses" && myBonus > 0) ||
    (state?.phase === "settled" &&
      (mainWinNet > 0 ||
        (ownGamble?.round === state.round && ownGamble.result === "win")));
  const disabled = !connected || pending || state?.phase === "shuffling";
  const cardCount =
    (state?.dealer.length ?? 0) +
    (state?.seats
      .flatMap((s) => s.hands)
      .reduce((n, h) => n + h.cards.length, 0) ?? 0);
  const interactionRef = useRef({
    profile,
    playerId,
    betting,
    playerReady: !!me?.ready,
    disabled,
    chip,
    chipBalance,
  });
  interactionRef.current = {
    profile,
    playerId,
    betting,
    playerReady: !!me?.ready,
    disabled,
    chip,
    chipBalance,
  };

  useEffect(() => {
    if (chipInitialized.current || chipBalance <= 0) return;
    const page =
      BLACKJACK_CHIP_PRESETS[
        chipPageForBalance(BLACKJACK_CHIP_PRESETS, chipBalance)
      ] ?? BLACKJACK_CHIP_PRESETS[0];
    const suggestion = affordableChipInPage(page, chipBalance);
    if (suggestion !== undefined) setChip(suggestion);
    chipInitialized.current = true;
  }, [chipBalance]);

  useEffect(() => {
    if (chipBalance > 0 && chip > chipBalance) {
      const affordable = BLACKJACK_CHIP_PRESETS.flat()
        .filter((amount) => amount <= chipBalance)
        .at(-1);
      if (affordable !== undefined) setChip(affordable);
    }
  }, [chip, chipBalance]);

  useEffect(() => {
    enterBlackjack();
    return leaveBlackjack;
  }, [enterBlackjack, leaveBlackjack]);

  useEffect(() => {
    if (profile && connected && state?.id) void joinBlackjack();
  }, [connected, joinBlackjack, profile, state?.id]);

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
    if (state?.phase === "shuffling") setGambleOpen(false);
  }, [state?.phase]);
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
    if (sound && cardCount > previousCards.current && audioRef.current)
      playCasinoSound(
        audioRef.current,
        "card",
        cardCount - previousCards.current,
      );
    previousCards.current = cardCount;
  }, [cardCount, sound]);
  useEffect(() => {
    const previous = previousOwnBet.current;
    previousOwnBet.current = totalBet;
    if (!hasSeenOwnBet.current) {
      hasSeenOwnBet.current = true;
      return;
    }
    if (sound && totalBet > previous && audioRef.current)
      playCasinoSound(audioRef.current, "chips");
  }, [sound, totalBet]);
  useEffect(() => {
    const previous = previousOwnBalance.current;
    previousOwnBalance.current = balance;
    if (!hasSeenOwnBalance.current) {
      hasSeenOwnBalance.current = true;
      return;
    }
    if (sound && ownWinEvent && balance > previous && audioRef.current)
      playCasinoSound(audioRef.current, "chips");
  }, [balance, ownWinEvent, sound]);
  useEffect(() => {
    if (sound && state?.phase === "shuffling" && audioRef.current)
      playCasinoSound(audioRef.current, "shuffle");
  }, [state?.phase, sound]);
  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement)
        setIsFullscreen(false);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selectSeat = useCallback(
    (s: Seat) => {
      const { profile, playerId, betting } = interactionRef.current;
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
    },
    [command],
  );
  const releaseSeat = useCallback(
    (target: Seat) => {
      void command({ type: "release", seat: target.index }).then((ok) => {
        if (ok) setBetHistory([]);
      });
    },
    [command],
  );
  const placeBet = useCallback(
    (target: Seat, type: keyof Bet) => {
      const { playerId, betting, playerReady, disabled, chip, chipBalance } =
        interactionRef.current;
      if (
        target.playerId !== playerId ||
        !betting ||
        playerReady ||
        disabled ||
        chip > chipBalance
      )
        return;
      if (type !== "main" && !target.bet.main) {
        setToast("Posez d’abord un jeton sur Blackjack pour cette main.");
        return;
      }
      setSelectedSeat(target.index);
      const before = { ...target.bet };
      const beforeChips = copyBetChips(target.chips);
      void command({
        type: "bet",
        seat: target.index,
        bet: { ...before, [type]: before[type] + chip },
        chips: addBetChip(beforeChips, type, chip),
      }).then((ok) => {
        if (ok)
          setBetHistory((history) => [
            ...history,
            { seat: target.index, before, beforeChips },
          ]);
      });
    },
    [command],
  );
  const selectChip = useCallback(
    (amount: number) => {
      if (amount <= chipBalance) setChip(amount);
    },
    [chipBalance],
  );
  const undoBet = () => {
    const last = betHistory.at(-1);
    if (!last) return;
    void command({
      type: "bet",
      seat: last.seat,
      bet: last.before,
      chips: last.beforeChips,
    }).then((ok) => {
      if (ok) setBetHistory((history) => history.slice(0, -1));
    });
  };
  const repeatBet = () => {
    if (!previousBetTotal || totalBet) return;
    const before = ownSeats
      .filter((target) => target.previousBet)
      .map((target) => ({
        seat: target.index,
        before: { ...target.bet },
        beforeChips: copyBetChips(target.chips),
      }));
    void command({ type: "repeat" }).then((ok) => {
      if (ok) setBetHistory(before);
    });
  };
  const clearBets = async () => {
    for (const target of ownSeats)
      if (betTotal(target.bet)) {
        const ok = await command({
          type: "bet",
          seat: target.index,
          bet: { main: 0, three: 0, pairs: 0 },
          chips: emptyBetChips(),
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
  const shareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (state?.id) url.searchParams.set("table", state.id);
    return url.toString();
  }, [state?.id]);
  const invite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setToast("Lien copié. La table attend vos amis.");
    } catch {
      setModal("invite");
    }
  }, [shareUrl]);
  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;

    if (isFullscreen) {
      setIsFullscreen(false);
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    setIsFullscreen(true);
    if (document.fullscreenEnabled && shell.requestFullscreen) {
      try {
        await shell.requestFullscreen();
      } catch {
        // The layout-only mode remains useful when the browser blocks fullscreen.
      }
    }
  }, [isFullscreen]);
  const goHome = useCallback(() => onNavigate("home"), [onNavigate]);
  const goBlackjack = useCallback(() => setModal(null), []);
  const goMines = useCallback(() => onNavigate("mines"), [onNavigate]);
  const goPoker = useCallback(() => onNavigate("poker"), [onNavigate]);
  const goTower = useCallback(() => onNavigate("tower"), [onNavigate]);
  const goChicken = useCallback(() => onNavigate("chicken"), [onNavigate]);
  const goRoulette = useCallback(() => onNavigate("roulette"), [onNavigate]);
  const goPlinko = useCallback(() => onNavigate("plinko"), [onNavigate]);
  const openTables = useCallback(() => setModal("tables"), []);
  const openHistory = useCallback(() => setModal("history"), []);
  const openRules = useCallback(() => setModal("rules"), []);
  const subtitle = myTurn
    ? "C’est à vous de jouer"
    : state?.phase === "insurance"
      ? insuranceSeat
        ? "Choisissez votre assurance"
        : "Assurances en cours"
      : state?.phase === "shuffling"
        ? "Mélange du sabot"
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
    <div
      ref={shellRef}
      className={`casino-shell blackjack-casino-shell ${isFullscreen ? "is-fullscreen" : ""}`}
    >
      <EmoteLayer
        game="blackjack"
        events={game.emotes}
        playerId={playerId}
        onDone={game.dismissEmote}
      />
      <BlackjackSidebar
        onHome={goHome}
        onBlackjack={goBlackjack}
        onMines={goMines}
        onPoker={goPoker}
        onTower={goTower}
        onChicken={goChicken}
        onRoulette={goRoulette}
        onPlinko={goPlinko}
        onRules={openRules}
        blackjackLabel={profile ? "Blackjack" : "Table de cartes"}
      />

      <div className="ml-[76px] max-[700px]:ml-[55px] max-[450px]:ml-0">
        <BlackjackTopbar
          balance={balance}
          name={me?.name ?? profile?.name ?? "M"}
          onSignOut={game.signOut}
        />

        <main>
          <BlackjackPageHeading onInvite={invite} />

          <div className="game-layout">
            <div className="main-column">
              <section className="table-panel" aria-label="Table de blackjack">
                <BlackjackTableToolbar
                  connected={connected}
                  tableId={
                    state?.visibility === "private" ? state.id : "PUBLIQUE"
                  }
                  isFullscreen={isFullscreen}
                  seatCount={
                    state?.seats.filter((seat) => seat.playerId).length ?? 0
                  }
                  countdownDeadline={
                    state?.phase === "settled" ? null : (state?.deadline ?? null)
                  }
                  playerId={playerId}
                  emotePlayers={emotePlayers}
                  onSendEmote={game.sendEmote}
                  onToggleFullscreen={toggleFullscreen}
                  onOpenTables={openTables}
                  onOpenHistory={openHistory}
                />
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
                          <PlayingCard
                            key={card.id}
                            card={card}
                            index={i}
                            backSkin={viewerBack}
                          />
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
                    <PlayingCard back decorative backSkin={viewerBack} />
                    <span>8 JEUX</span>
                  </div>
                  {state?.phase === "shuffling" && (
                    <PokerShuffleAnimation
                      hand={state.round}
                      eyebrow="8 JEUX"
                      title="Mélange du sabot"
                      ariaLabel="Mélange du sabot"
                    />
                  )}
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
                  {showCenterSettlement && roundResult && (
                    <div
                      className={`table-round-result ${roundBetNet > 0 ? "positive" : roundBetNet < 0 ? "negative" : "neutral"}`}
                      role="status"
                      aria-label={`Résultat de la manche : ${roundBetNet < 0 ? "perte de " : "retour de "}${credits(roundBetNet < 0 ? Math.abs(roundBetNet) : roundPayout)} crédits`}
                    >
                      <span className="table-round-result-kicker">
                        {roundBetNet > 0
                          ? "RETOUR TOTAL"
                          : roundBetNet === 0
                            ? "MISE REMBOURSÉE"
                            : "PERDU"}
                      </span>
                      <strong>
                        {roundBetNet < 0 ? "−" : "+"}
                        {credits(
                          roundBetNet < 0 ? Math.abs(roundBetNet) : roundPayout,
                        )}
                        <small>cr.</small>
                      </strong>
                      <span className="table-round-result-countdown">
                        <CountdownText deadline={state?.deadline} />
                      </span>
                    </div>
                  )}
                  {(state?.seats ?? EMPTY_SEATS).map((s) => (
                    <SeatView
                      key={s.index}
                      seat={s}
                      owner={state?.players.find((p) => p.id === s.playerId)}
                      phase={state?.phase ?? null}
                      activeHandId={state?.activeHandId ?? null}
                      playerSeatCount={
                        s.playerId === playerId ? ownSeats.length : 0
                      }
                      playerId={playerId}
                      selected={s.index === seat?.index}
                      onSelect={selectSeat}
                      onBet={placeBet}
                      onRelease={releaseSeat}
                      chip={s.playerId === playerId ? chip : 0}
                      disabled={s.playerId === playerId && disabled}
                      backSkin={tableCardBack(tableSkins, s.playerId, playerId)}
                    />
                  ))}
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
                  {(state?.phase === "settled" ||
                    state?.phase === "betting") &&
                    ownGamble &&
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
                <div
                  className="table-status-announcer"
                  role="status"
                  aria-live="polite"
                >
                  {!profile
                    ? "Votre place vous attend."
                    : !connected
                      ? "Connexion à la table…"
                      : (state?.message ?? "Bienvenue à la table.")}
                </div>
                {showControlsPanel && (
                  <div
                    className={`controls-panel ${betting ? "controls-betting" : ""} ${myTurn || insuranceSeat ? "controls-active controls-decision" : ""}`}
                    aria-label="Actions de jeu"
                  >
                    {!myTurn && !insuranceSeat && (
                      <div className="controls-heading">
                        <div>
                          <span className="section-kicker">
                            {betting
                              ? "À VOUS DE MISER"
                              : state?.phase === "insurance"
                                ? "ASSURANCE · AS DU CROUPIER"
                                : state?.phase === "shuffling"
                                  ? "MÉLANGE EN COURS"
                                  : "LA PARTIE CONTINUE"}
                          </span>
                          <h2>{subtitle}</h2>
                        </div>
                        {betting && (
                          <span className="selected-hand-label">
                            {seat ? `Main ${seat.index + 1}` : "Spectateur"}
                            {ownSeats.length > 1 && (
                              <span> / {ownSeats.length} mains</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                    <AnimatedMenu active={betting} className="betting-actions">
                      {betting ? (
                        <>
                          <div className="chip-rack">
                            <div className="chip-picker">
                              <ChipSlider
                                pages={BLACKJACK_CHIP_PRESETS}
                                balance={chipBalance}
                                selected={chip}
                                disabled={!!me?.ready}
                                onSelect={selectChip}
                                onPageChange={(page) => {
                                  const nextChip = affordableChipInPage(
                                    BLACKJACK_CHIP_PRESETS[page] ?? [],
                                    chipBalance,
                                  );
                                  if (nextChip !== undefined) setChip(nextChip);
                                }}
                              />
                              <span className="rack-divider" />
                              <button
                                className="icon-button repeat-bet"
                                disabled={
                                  disabled ||
                                  !previousBetTotal ||
                                  totalBet > 0 ||
                                  previousBetTotal > balance ||
                                  !!me?.ready
                                }
                                onClick={repeatBet}
                                title={
                                  previousBetTotal
                                    ? `Répéter la mise précédente (${credits(previousBetTotal)} crédits)`
                                    : "Aucune mise précédente"
                                }
                                aria-label="Répéter la mise précédente"
                              >
                                <Repeat2 size={16} />
                                <span>Répéter</span>
                              </button>
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
                              Jeton de <b>{chipLabel(chip)}</b> sélectionné ·
                              cliquez sur le tapis pour miser
                            </span>
                          </div>
                          <div className="bet-confirm">
                            <span>
                              MISE TOTALE
                              <b>
                                {credits(totalBet)} <small>cr.</small>
                              </b>
                            </span>
                            <button
                              type="button"
                              className="icon-button repeat-bet mobile-repeat-bet"
                              disabled={
                                disabled ||
                                !previousBetTotal ||
                                totalBet > 0 ||
                                previousBetTotal > balance ||
                                !!me?.ready
                              }
                              onClick={repeatBet}
                              title={
                                previousBetTotal
                                  ? `Répéter la mise précédente (${credits(previousBetTotal)} crédits)`
                                  : "Aucune mise précédente"
                              }
                              aria-label="Répéter la mise précédente"
                            >
                              <Repeat2 size={16} />
                              <span>Répéter</span>
                            </button>
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
                            onClick={() => releaseSeat(seat)}
                          >
                            Libérer cette place
                          </button>
                        )}
                      </div>
                    )}
                    <AnimatedMenu
                      active={!!insuranceSeat}
                      className="play-actions insurance-actions"
                    >
                      {insuranceSeat && (
                        <>
                          <button
                            className="button insurance-decline"
                            disabled={disabled}
                            aria-label={`Refuser l’assurance pour la main ${insuranceSeat.index + 1}`}
                            onClick={() =>
                              command({
                                type: "insurance",
                                seat: insuranceSeat.index,
                                take: false,
                              })
                            }
                          >
                            <span>
                              Refuser<small>Continuer</small>
                            </span>
                          </button>
                          <button
                            className="button insurance-accept"
                            disabled={
                              disabled || balance < insuranceSeat.bet.main / 2
                            }
                            aria-label={`Assurer la main ${insuranceSeat.index + 1} pour ${credits(insuranceSeat.bet.main / 2)} crédits. Gain net de ${credits(insuranceSeat.bet.main)} crédits si le croupier a un blackjack`}
                            onClick={() =>
                              command({
                                type: "insurance",
                                seat: insuranceSeat.index,
                                take: true,
                              })
                            }
                          >
                            <ShieldCheck size={20} />
                            <span>
                              Assurer
                              <small>
                                {credits(insuranceSeat.bet.main / 2)} cr.
                              </small>
                            </span>
                          </button>
                        </>
                      )}
                    </AnimatedMenu>
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
                  </div>
                )}
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

      {modal === "rules" && (
        <Modal
          title="Règles du jeu"
          onClose={() => setModal(null)}
          className="rules-modal"
        >
          <span className="section-kicker">LES RÈGLES DE LA TABLE</span>
          <h2>Tout se joue à 21.</h2>
          <p className="modal-intro">
            Blackjack européen · 8 jeux de 52 cartes · choisissez vos jetons
            selon la mise visée.
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
            Les cotes indiquent le gain net. À 9:1, le gain vaut neuf fois la
            mise, qui est aussi rendue. Les paris annexes sont payés dès la
            distribution, avant le premier choix d’action. Ils sont indépendants
            du blackjack. Un gain net peut ensuite être tenté autant de fois que
            vous le souhaitez sur rouge ou noir : chaque bonne carte double le
            montant, une mauvaise carte arrête la série. Vous pouvez encaisser
            quand vous voulez. Si le croupier montre un as, vous pouvez assurer
            chaque main pour la moitié de sa mise : l’assurance paie 2:1 si le
            croupier a un blackjack. Pas d’abandon. Votre profil est sauvegardé
            sur cet appareil ; les tables sont conservées en mémoire tant que le
            serveur fonctionne.
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
            Rejoignez automatiquement une table publique disponible, ou créez
            votre espace privé et partagez son lien à vos amis.
          </p>
          <div className="public-table-section">
            <span className="table-list-heading">TABLE PUBLIQUE</span>
            <div className="public-table-list">
              <button
                type="button"
                className={`public-table-option ${currentPublicTable ? "current" : ""}`}
                disabled={!connected || !canChangeTable || currentPublicTable}
                onClick={() => {
                  game.changeTable(null);
                  setModal(null);
                }}
                aria-current={currentPublicTable ? "page" : undefined}
                aria-label="Rejoindre automatiquement une table publique"
              >
                <span className="public-table-status" aria-hidden="true">
                  <i />
                </span>
                <span className="public-table-copy">
                  <b>Table automatique</b>
                  <small>
                    {currentPublicTable
                      ? `${publicPlayerCount} / 5 places · vous êtes ici`
                      : "Une table ouverte vous sera attribuée"}
                  </small>
                </span>
                {currentPublicTable ? (
                  <Check size={15} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </button>
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
              game.createPrivateTable();
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
                placeholder="Ex. A7C2F1B8D903"
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

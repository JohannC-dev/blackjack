"use client";

import {
  ArrowLeft,
  Castle,
  Check,
  Coins,
  EyeOff,
  House,
  LoaderCircle,
  MessageCircle,
  Send,
  Settings2,
  ShieldCheck,
  Spade,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  credits,
  describePokerHolding,
  evaluateBestPokerHand,
  getPokerCombinationCards,
} from "@/lib/rules";
import { chipStackForComposition, chipColors } from "@/lib/chips";
import {
  CASINO_DEAL_INTERVAL,
  playCasinoSound,
  preloadCasinoSounds,
} from "@/lib/casino-audio";
import { useGameAudio } from "@/lib/audio-context";
import type { PokerAction, PokerSeat } from "@/lib/types";
import { useGame } from "@/lib/use-game";
import { CasinoRail, ClubHeader, getClubBalance } from "../../ui";
import type { CasinoView } from "@/lib/navigation";
import { BlackjackIcon } from "../../ui/blackjack-icon";
import { useCountdownSeconds, useServerClockNow } from "../../ui/countdown";
import { PlayingCard } from "../../ui/playing-card";
import { PokerLobby } from "./poker-lobby";
import { PokerShuffleAnimation } from "../../ui/poker-shuffle";
import { RoomArt } from "./room-art";
import { EmoteButton, EmoteLayer, type EmotePlayer } from "../../ui/emotes";
import { GamePoster } from "../../ui/game-poster";
import { MineBomb, MineDiamond } from "../mines/mine-art";
import { TowerPosterArt } from "../tower/tower-art";
import { ChickenArt } from "../chicken/chicken-art";
import { RoulettePosterArt } from "../roulette/roulette-wheel";

type Game = ReturnType<typeof useGame>;
type Navigate = (view: CasinoView) => void;

const FIVE_POSITIONS = [
  { x: 11, y: 52 },
  { x: 29, y: 72 },
  { x: 50, y: 77 },
  { x: 71, y: 72 },
  { x: 89, y: 52 },
];
const THREE_POSITIONS = [
  { x: 15, y: 61 },
  { x: 50, y: 77 },
  { x: 85, y: 61 },
];
export function CasinoHome({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: Navigate;
}) {
  const [towerHot, setTowerHot] = useState(false);
  return (
    <div className="casino-shell hub-shell">
      <CasinoRail
        active="home"
        onNavigate={onNavigate}
        blackjackLabel="Table de cartes"
      />
      <div className="ml-[76px] max-[700px]:ml-[55px] max-[450px]:ml-0">
        <ClubHeader
          balance={getClubBalance(game)}
          name={game.profile?.name ?? ""}
          onSignOut={game.signOut}
        />
        <main className="club-lobby">
          <section className="club-hero">
            <div className="club-hero-copy">
              <span className="eyebrow">LE CLUB / OUVERT TOUTE LA NUIT</span>
              <h1>
                Choisissez
                <br />
                <em>votre table.</em>
              </h1>
              <p>
                Sept jeux, un seul portefeuille. Entrez sans attendre — les
                cartes et la grille sont déjà prêtes.
              </p>
              <div className="club-trust">
                <ShieldCheck size={15} /> Crédits fictifs · Parties en direct
              </div>
            </div>
            <div className="club-emblem" aria-hidden="true">
              <span className="club-moon" />
              <Spade size={86} fill="currentColor" />
              <i>MINUIT</i>
            </div>
          </section>
          <section className="game-selection" aria-label="Jeux disponibles">
            <GamePoster
              className="blackjack-poster"
              buttonTitle="Blackjack"
              index="01"
              art={
                <>
                  <span>21</span>
                  <PlayingCard
                    card={{ id: "home-a", rank: 1, suit: "spades" }}
                    decorative
                  />
                  <PlayingCard
                    card={{ id: "home-k", rank: 13, suit: "hearts" }}
                    decorative
                  />
                </>
              }
              eyebrow="JEU DE TABLE"
              title={
                <>
                  Blackjack
                  <br />
                  Européen
                </>
              }
              description="Le classique de la maison, enrichi de paris annexes."
              action="Rejoindre la table"
              onClick={() => onNavigate("blackjack")}
            />
            <GamePoster
              className="poker-poster"
              index="02"
              artClassName="poker-art"
              art={<RoomArt theme="salon" poster />}
              eyebrow="NOUVEAU · MULTIJOUEUR"
              title={
                <>
                  Texas
                  <br />
                  Hold’em
                </>
              }
              description="Cash Game à cinq ou Spin & Play en format éclair."
              action="Entrer dans le lobby"
              onClick={() => onNavigate("poker")}
            />
            <GamePoster
              className="roulette-poster"
              index="03"
              artClassName="roulette-art"
              art={<RoulettePosterArt />}
              eyebrow="JEU DE TABLE · MULTIJOUEUR"
              title={
                <>
                  Roulette
                  <br />
                  Européenne
                </>
              }
              description="Le tapis vert, les mises classiques et la bille en direct."
              action="Jouer à la roulette"
              onClick={() => onNavigate("roulette")}
            />
            <GamePoster
              className="tower-poster"
              index="04"
              artClassName="tower-art"
              art={<TowerPosterArt hot={towerHot} />}
              eyebrow="NOUVEAU · SOLO & LIVE"
              title={
                <>
                  La
                  <br />
                  Tower
                </>
              }
              description="Dix étages, un piège par rangée. Encaissez avant la chute."
              action="Grimper la tour"
              onClick={() => onNavigate("tower")}
              onMouseEnter={() => setTowerHot(true)}
              onMouseLeave={() => setTowerHot(false)}
              onFocus={() => setTowerHot(true)}
              onBlur={() => setTowerHot(false)}
            />
            <GamePoster
              className="mines-poster"
              index="05"
              artClassName="mines-art"
              art={
                <>
                  <div className="mines-poster-grid" aria-hidden="true">
                    {Array.from({ length: 9 }, (_, index) => (
                      <span key={index} className={index === 4 ? "is-gem" : ""}>
                        {index === 4 && <MineDiamond />}
                      </span>
                    ))}
                  </div>
                  <MineBomb />
                </>
              }
              eyebrow="NOUVEAU · EXTRACTION"
              title={
                <>
                  Jeu de la
                  <br />
                  Mine
                </>
              }
              description="Choisissez votre objectif, trouvez les diamants, encaissez."
              action="Commencer l’extraction"
              onClick={() => onNavigate("mines")}
            />
            <GamePoster
              className="chicken-poster"
              index="06"
              artClassName="chicken-poster-art"
              art={
                <>
                  <span className="chicken-poster-road" />
                  <ChickenArt />
                </>
              }
              eyebrow="NOUVEAU · SOLO & LIVE"
              title="Chicken"
              description="Sautez, encaissez et croisez les autres poulets sur la route."
              action="Traverser la route"
              onClick={() => onNavigate("chicken")}
            />
            <GamePoster
              className="plinko-poster"
              index="07"
              artClassName="plinko-art"
              art={
                <>
                  <span className="plinko-poster-ball" aria-hidden="true" />
                  <div className="plinko-poster-pins" aria-hidden="true">
                    {[3, 4, 5, 6, 7].map((count) => (
                      <span key={count}>
                        {Array.from({ length: count }, (_, index) => (
                          <i key={index} />
                        ))}
                      </span>
                    ))}
                  </div>
                  <div className="plinko-poster-slots" aria-hidden="true">
                    {Array.from({ length: 7 }, (_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                </>
              }
              eyebrow="NOUVEAU · JEU SOLO"
              title={
                <>
                  Le
                  <br />
                  Plinko
                </>
              }
              description="Une bille, seize rangées, des multiplicateurs jusqu’aux bords."
              action="Lâcher une bille"
              onClick={() => onNavigate("plinko")}
            />
          </section>
        </main>
      </div>
    </div>
  );
}

export function PokerCasino({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: Navigate;
}) {
  const poker = game.pokerState;
  return (
    <div className="casino-shell poker-shell">
      <CasinoRail active="poker" onNavigate={onNavigate} />
      <div className="ml-[76px] max-[700px]:ml-[55px] max-[450px]:ml-0">
        <ClubHeader
          balance={getClubBalance(game)}
          name={game.profile?.name ?? ""}
          onSignOut={game.signOut}
        />
        {poker?.status === "table" && poker.table ? (
          <PokerTable game={game} />
        ) : poker?.status === "queue" ? (
          <PokerQueue game={game} />
        ) : (
          <PokerLobby game={game} onNavigate={onNavigate} />
        )}
      </div>
      {game.error && (
        <div className="toast error-toast is-visible" role="alert">
          <X size={16} />
          <span>{game.error}</span>
          <button onClick={() => game.setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function PokerQueue({ game }: { game: Game }) {
  const queue = game.pokerState!.queue!;
  return (
    <main className="queue-screen">
      <div className="queue-orbit">
        <span />
        <span />
        <span />
        <div>
          <Spade size={36} fill="currentColor" />
        </div>
      </div>
      <span className="eyebrow">SPIN & PLAY · {credits(queue.stake)} CR.</span>
      <h1>La table se compose.</h1>
      <p>
        {queue.waiting} joueur{queue.waiting > 1 ? "s" : ""} sur 3 · Votre
        buy-in est réservé.
      </p>
      <div className="queue-slots">
        {[0, 1, 2].map((index) => (
          <span key={index} className={index < queue.waiting ? "filled" : ""}>
            {index < queue.waiting ? (
              <Check size={17} />
            ) : (
              <LoaderCircle size={17} />
            )}
          </span>
        ))}
      </div>
      <button
        className="button secondary"
        disabled={game.pending}
        onClick={() => game.pokerCommand({ type: "leave" })}
      >
        Annuler et récupérer {credits(queue.stake)} cr.
      </button>
    </main>
  );
}

function PokerTurnIndicator({
  deadline,
  durationMs,
}: {
  deadline: number | null;
  durationMs: number;
}) {
  const seconds = useCountdownSeconds(deadline) ?? 0;

  if (deadline === null) return null;
  const now = useServerClockNow();
  const remainingMs = Math.max(0, Math.min(durationMs, deadline - now));
  const progress = 100 * (1 - remainingMs / durationMs);

  return (
    <>
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
      <span className="poker-turn-seconds">{seconds}s</span>
    </>
  );
}

function PokerRevealActions({
  deadline,
  disabled,
  mucked,
  onShow,
  onMuck,
}: {
  deadline: number | null;
  disabled: boolean;
  mucked: boolean;
  onShow: () => void;
  onMuck: () => void;
}) {
  const seconds = useCountdownSeconds(deadline);
  const available = deadline !== null && (seconds ?? 0) > 0;

  if (!available)
    return (
      <div className="hand-visibility-resolved" role="status">
        <EyeOff size={14} />
        <span>
          <small>VISIBILITÉ DE LA MAIN</small>
          <b>{mucked ? "Main cachée" : "Main montrée"}</b>
        </span>
      </div>
    );

  return (
    <div
      className="hand-visibility-actions"
      role="group"
      aria-label="Visibilité de votre main"
    >
      <button
        type="button"
        className="show-hand"
        disabled={disabled}
        onClick={onShow}
      >
        <span>Montrer</span>
        <b>{seconds}s</b>
      </button>
      <button
        type="button"
        className="hide-hand"
        disabled={disabled}
        onClick={onMuck}
      >
        <span>
          <EyeOff size={13} /> Cacher
        </span>
      </button>
    </div>
  );
}

const PokerTableHeading = memo(function PokerTableHeading({
  kicker,
  title,
  chatCount,
  totalSeats,
  occupiedSeats,
  onLeave,
  onOpenChat,
  emoteSlot,
}: {
  emoteSlot: ReactNode;
  kicker: string;
  title: string;
  chatCount: number;
  totalSeats: number;
  occupiedSeats: number;
  onLeave: () => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="poker-table-heading">
      <button className="lobby-back" onClick={onLeave}>
        <ArrowLeft size={15} /> Quitter la table
      </button>
      <div>
        <span className="eyebrow">{kicker}</span>
        <h1>{title}</h1>
      </div>
      <button
        type="button"
        className="poker-chat-launch"
        aria-label="Ouvrir la discussion"
        aria-haspopup="dialog"
        onClick={onOpenChat}
      >
        <MessageCircle size={15} />
        <span>Chat</span>
        {!!chatCount && <b>{chatCount}</b>}
      </button>
      {emoteSlot}
      <div className="table-players-count">
        <Users size={16} /> {occupiedSeats} / {totalSeats}
      </div>
    </div>
  );
});

function PokerTable({ game }: { game: Game }) {
  const table = game.pokerState!.table!;
  const me = table.seats.find((seat) => seat.id === game.playerId);
  const [raiseTo, setRaiseTo] = useState(0);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [chat, setChat] = useState("");
  const [blocked, setBlocked] = useState<string[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const { enabled: sound, contextRef: audioRef } =
    useGameAudio(preloadCasinoSounds);
  const previousAudioState = useRef({
    hand: table.hand,
    cards: table.community.length,
    active: table.activePlayerId,
    phase: table.phase,
  });
  const emoteSignature = JSON.stringify(
    table.seats.map((seat) => ({ id: seat.id, name: seat.name })),
  );
  const { sendEmote, playerId } = game;
  const emoteSlot = useMemo(() => {
    const players: EmotePlayer[] = JSON.parse(emoteSignature);
    return (
      <EmoteButton
        game="poker"
        players={players}
        playerId={playerId}
        seated={players.some((player) => player.id === playerId)}
        onSend={sendEmote}
      />
    );
  }, [emoteSignature, playerId, sendEmote]);
  // Blocking a player in the chat also hides their emotes.
  const emotes = useMemo(
    () => game.emotes.filter((event) => !blocked.includes(event.fromId)),
    [game.emotes, blocked],
  );
  const toCall = me ? Math.max(0, table.currentBet - me.bet) : 0;
  const minimumRaise = table.currentBet + table.minRaise;
  const maximum = me ? me.bet + me.stack : 0;
  const raiseSteps = useMemo(() => {
    const minimum = Math.min(minimumRaise, maximum);
    if (maximum <= minimum) return [Math.max(0, maximum)];
    const clamp = (value: number) =>
      Math.min(maximum, Math.max(minimum, Math.round(value)));
    const values = new Set<number>([
      minimum,
      clamp(table.pot / 2),
      clamp((table.pot * 3) / 4),
      clamp(table.pot),
      maximum,
    ]);
    const range = maximum - minimum;
    const increment =
      Math.max(1, Math.ceil(range / 9 / table.bigBlind)) * table.bigBlind;
    for (let value = minimum + increment; value < maximum; value += increment)
      values.add(clamp(value));
    return [...values].sort((a, b) => a - b);
  }, [maximum, minimumRaise, table.bigBlind, table.pot]);
  useEffect(() => setRaiseTo(raiseSteps[0] ?? 0), [raiseSteps]);
  useEffect(() => {
    setRaiseOpen(false);
  }, [table.activePlayerId, table.phase]);
  useEffect(() => {
    if (!chatOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [chatOpen]);
  useEffect(() => {
    const previous = previousAudioState.current;
    previousAudioState.current = {
      hand: table.hand,
      cards: table.community.length,
      active: table.activePlayerId,
      phase: table.phase,
    };
    const context = audioRef.current;
    if (!sound || !context) return;
    const actedSeat =
      previous.active && previous.active !== table.activePlayerId
        ? table.seats.find((seat) => seat.id === previous.active)
        : undefined;
    const actionEffect = actedSeat?.lastAction?.startsWith("Check")
      ? "knock"
      : actedSeat?.lastAction?.startsWith("Fold")
        ? "fold"
        : /^(Raise|Bet|All-in)/.test(actedSeat?.lastAction ?? "")
          ? "chips"
          : undefined;
    if (table.phase === "shuffling" && previous.phase !== "shuffling")
      playCasinoSound(context, "shuffle");
    else if (actionEffect) playCasinoSound(context, actionEffect);
    if (table.community.length > previous.cards)
      playCasinoSound(context, "card", table.community.length - previous.cards);
    else if (table.hand > previous.hand)
      playCasinoSound(
        context,
        "card",
        table.seats.reduce((total, seat) => total + seat.cards.length, 0),
      );
  }, [
    sound,
    table.activePlayerId,
    table.community.length,
    table.hand,
    table.phase,
    table.seats,
  ]);
  const turnDurationMs = (table.mode === "spin" ? 15 : 25) * 1_000;
  const myTurn = table.activePlayerId === game.playerId;
  const allInContenders = table.seats.filter(
    (seat) => seat.status === "active" || seat.status === "all-in",
  );
  const allInRunout =
    !table.activePlayerId &&
    ["preflop", "flop", "turn", "river"].includes(table.phase) &&
    allInContenders.length === 2 &&
    allInContenders.some((seat) => seat.status === "all-in");
  const positions = table.mode === "spin" ? THREE_POSITIONS : FIVE_POSITIONS;
  const totalSeats = table.mode === "spin" ? 3 : 5;
  const pokerMaximumBet = table.mode === "cash" ? table.bigBlind * 100 : 500;
  const pokerMaximumPot = pokerMaximumBet * table.seats.length;
  const dealDelays = useMemo(() => {
    const dealtSeats = table.seats.filter((seat) => seat.cards.length > 0);
    const seatsInDealOrder = [...dealtSeats].sort((a, b) => {
      const distanceFromButton = (seat: number) => {
        if (table.button < 0) return seat;
        return (seat - table.button + totalSeats) % totalSeats || totalSeats;
      };
      return distanceFromButton(a.seat) - distanceFromButton(b.seat);
    });
    const delays = new Map<string, number>();
    seatsInDealOrder.forEach((seat, seatIndex) => {
      seat.cards.forEach((card, cardIndex) => {
        const dealIndex = cardIndex * seatsInDealOrder.length + seatIndex;
        delays.set(card.id, dealIndex * CASINO_DEAL_INTERVAL);
      });
    });
    return delays;
  }, [table.button, table.seats, totalSeats]);
  const sendAction = (action: PokerAction, amount?: number) => {
    setRaiseOpen(false);
    return game.pokerCommand({ type: "action", action, amount });
  };
  const selectRaiseTarget = (target: number) => {
    const nearest = raiseSteps.reduce((best, value) =>
      Math.abs(value - target) < Math.abs(best - target) ? value : best,
    );
    setRaiseTo(nearest);
  };
  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    if (!chat.trim()) return;
    void game
      .pokerCommand({ type: "chat", text: chat })
      .then((ok) => ok && setChat(""));
  };
  const seatSlots = Array.from({ length: totalSeats }, (_, seat) =>
    table.seats.find((entry) => entry.seat === seat),
  );
  const collectingBets =
    table.seats.some((seat) => seat.bet > 0) &&
    (table.phase === "showdown" ||
      (!table.activePlayerId &&
        ["preflop", "flop", "turn", "river"].includes(table.phase)));
  const handResult = table.history.find((item) => item.hand === table.hand);
  const showdownCards = useMemo(() => {
    const winning = new Set<string>();
    const winnerPlayerIds = new Set<string>();
    if (table.phase !== "showdown" || !handResult)
      return { winning, winnerPlayerIds, hasCombination: false };
    for (const winner of handResult.winners) {
      winnerPlayerIds.add(winner.playerId);
      if (winner.mucked || winner.cards.length !== 2) continue;
      if (winner.cards.length + handResult.community.length < 5) continue;
      // Community cards come first so a board that plays is represented as such.
      const best = evaluateBestPokerHand([
        ...handResult.community,
        ...winner.cards,
      ]);
      for (const card of getPokerCombinationCards(best)) winning.add(card.id);
    }
    return {
      winning,
      winnerPlayerIds,
      hasCombination: winning.size > 0,
    };
  }, [handResult, table.phase]);
  const myWin = handResult?.winners.find(
    (winner) => winner.playerId === game.playerId,
  );
  const uncontestedWin = myWin?.label === "Uncontested pot";
  const canChooseReveal = uncontestedWin && table.revealDeadline !== null;
  const handLabel = me
    ? (describePokerHolding(me.cards, table.community) ?? me.handLabel)
    : undefined;
  const leaveTable = useCallback(() => {
    void game.pokerCommand({ type: "leave" });
  }, [game.pokerCommand]);
  const openChat = useCallback(() => setChatOpen(true), []);
  return (
    <main className="poker-table-page">
      <EmoteLayer
        game="poker"
        events={emotes}
        playerId={game.playerId}
        onDone={game.dismissEmote}
      />
      <PokerTableHeading
        kicker={`${table.mode === "spin" ? "SPIN & PLAY" : "CASH GAME"} / TABLE ${table.id.slice(-4)}`}
        title={
          table.mode === "spin"
            ? `${credits(table.stake)} crédits · ×${table.wheelMultiplier ?? "?"}`
            : `Blinds ${table.smallBlind} / ${table.bigBlind}`
        }
        chatCount={table.chat.length}
        totalSeats={totalSeats}
        occupiedSeats={table.seats.length}
        onLeave={leaveTable}
        onOpenChat={openChat}
        emoteSlot={emoteSlot}
      />
      <div className="poker-room-layout">
        <section className="poker-table-panel">
          <div className="poker-felt">
            <div className="poker-rail-line" />
            <div className="poker-rail-line inner" />
            <div className="poker-felt-mark">
              <Spade size={21} fill="currentColor" />
              <b>MINUIT</b>
              <small>NO LIMIT HOLD’EM</small>
            </div>
            <div className="community-cards">
              {Array.from({ length: 5 }, (_, index) =>
                table.community[index] ? (
                  <PlayingCard
                    key={table.community[index].id}
                    card={table.community[index]}
                    index={index}
                    dealDelay={index < 3 ? index * CASINO_DEAL_INTERVAL : 0}
                    highlighted={showdownCards.winning.has(
                      table.community[index].id,
                    )}
                    dimmed={
                      showdownCards.hasCombination &&
                      !showdownCards.winning.has(table.community[index].id)
                    }
                  />
                ) : (
                  <div className="community-placeholder" key={index}>
                    {index < 3 ? "F" : index === 3 ? "T" : "R"}
                  </div>
                ),
              )}
              <div className="pot-display">
                <span>POT TOTAL</span>
                <PokerChipStack
                  amount={table.pot}
                  maximum={pokerMaximumPot}
                  pot
                />
              </div>
            </div>
            {seatSlots.map((seat, index) => (
              <PokerSeatView
                key={index}
                seat={seat}
                position={positions[index]}
                table={table}
                playerId={game.playerId}
                dealDelays={dealDelays}
                winningCardIds={showdownCards.winning}
                winnerPlayerIds={showdownCards.winnerPlayerIds}
                showdown={showdownCards.hasCombination}
                collectingBet={collectingBets && !!seat?.bet}
                maximumBet={pokerMaximumBet}
              />
            ))}
            {collectingBets &&
              seatSlots.map((seat, index) =>
                seat?.bet ? (
                  <div
                    aria-hidden="true"
                    className="poker-chip-flight"
                    key={`${table.hand}-${table.phase}-${seat.id}-${seat.bet}`}
                    style={
                      {
                        "--chip-from-x": `${positions[index].x}%`,
                        "--chip-from-y": `${positions[index].y}%`,
                        "--chip-collect-delay": `${index * 35}ms`,
                      } as CSSProperties
                    }
                  >
                    <PokerChipStack
                      amount={seat.bet}
                      maximum={pokerMaximumBet}
                    />
                  </div>
                ) : null,
              )}
            {table.wheelSpinning && (
              <div className="spin-wheel-overlay">
                <div className="spin-wheel">
                  <span>×2</span>
                  <span>×3</span>
                  <span>×5</span>
                  <span>×10</span>
                  <span>×25</span>
                  <strong>×{table.wheelMultiplier}</strong>
                </div>
                <p>Le prix de la nuit…</p>
              </div>
            )}
            {table.phase === "shuffling" && (
              <PokerShuffleAnimation hand={table.hand} />
            )}
            {table.phase === "showdown" && handResult && (
              <div className="hand-result-banner" role="status">
                <span className="result-medallion">
                  <Trophy size={19} />
                </span>
                <div className="result-copy">
                  <span className="result-kicker">
                    HAND {String(table.hand).padStart(3, "0")} · SHOWDOWN
                  </span>
                  <div className="result-winners">
                    {handResult.winners.map((winner) => (
                      <p key={`${winner.name}-${winner.amount}`}>
                        <span>
                          <b>{winner.name}</b>
                          <small>{winner.label}</small>
                        </span>
                        <strong>+{credits(winner.amount)} cr.</strong>
                      </p>
                    ))}
                  </div>
                </div>
                {myWin && !uncontestedWin && (
                  <button
                    type="button"
                    className="muck-hand"
                    disabled={!!me?.mucked || game.pending}
                    onClick={() => game.pokerCommand({ type: "muck" })}
                  >
                    <EyeOff size={14} />
                    {me?.mucked ? "Hand mucked" : "Muck hand"}
                  </button>
                )}
              </div>
            )}
            {table.phase === "complete" && (
              <div className="poker-result-overlay">
                <Trophy size={34} />
                <span>TOURNOI TERMINÉ</span>
                <h2>{table.message}</h2>
                <div>
                  <button
                    className="button primary"
                    onClick={async () => {
                      const stake = table.stake;
                      await game.pokerCommand({ type: "leave" });
                      await game.pokerCommand({
                        type: "match",
                        mode: "spin",
                        stake,
                      });
                    }}
                  >
                    Rejouer
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => game.pokerCommand({ type: "leave" })}
                  >
                    Lobby
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="poker-control-bar">
            <div className="poker-hand-summary">
              <div>
                <span>YOUR HAND</span>
                <b>{handLabel ?? "En attente des cartes"}</b>
              </div>
              <div>
                <span>YOUR STACK</span>
                <b>{credits(me?.stack ?? 0)} cr.</b>
              </div>
              {!!me?.bet && (
                <div>
                  <span>STREET BET</span>
                  <b>{credits(me.bet)} cr.</b>
                </div>
              )}
            </div>
            <div
              className={`poker-action-zone ${myTurn || canChooseReveal ? "enabled" : ""}`}
            >
              {canChooseReveal ? (
                <PokerRevealActions
                  deadline={table.revealDeadline}
                  disabled={game.pending}
                  mucked={!!me?.mucked}
                  onShow={() => game.pokerCommand({ type: "show" })}
                  onMuck={() => game.pokerCommand({ type: "muck" })}
                />
              ) : uncontestedWin && table.phase === "showdown" ? (
                <div className="hand-visibility-resolved" role="status">
                  <EyeOff size={14} />
                  <span>
                    <small>VISIBILITÉ DE LA MAIN</small>
                    <b>{me?.mucked ? "Main cachée" : "Main montrée"}</b>
                  </span>
                </div>
              ) : allInRunout ? (
                <div className="poker-runout" role="status">
                  <span>ALL-IN</span>
                  <b>Les cartes se révèlent…</b>
                </div>
              ) : (
                <>
                  <div className="poker-actions">
                    <button
                      disabled={!myTurn || game.pending}
                      onClick={() => sendAction("fold")}
                      className="fold"
                    >
                      Fold
                    </button>
                    <button
                      disabled={!myTurn || game.pending}
                      onClick={() => sendAction(toCall ? "call" : "check")}
                    >
                      <span>{toCall ? "Call" : "Check"}</span>
                      {!!toCall && (
                        <small>
                          {credits(Math.min(toCall, me?.stack ?? 0))} cr.
                        </small>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !myTurn || game.pending || maximum <= table.currentBet
                      }
                      onClick={() => setRaiseOpen(!raiseOpen)}
                      className="raise"
                      aria-expanded={raiseOpen}
                    >
                      {table.currentBet ? "Raise" : "Bet"}
                    </button>
                  </div>
                  {raiseOpen && (
                    <div className="raise-drawer">
                      <div className="raise-presets">
                        <button
                          type="button"
                          onClick={() => selectRaiseTarget(table.pot / 2)}
                        >
                          ½ pot
                        </button>
                        <button
                          type="button"
                          onClick={() => selectRaiseTarget((table.pot * 3) / 4)}
                        >
                          ¾ pot
                        </button>
                        <button
                          type="button"
                          onClick={() => selectRaiseTarget(table.pot)}
                        >
                          Pot
                        </button>
                        <button
                          type="button"
                          onClick={() => selectRaiseTarget(maximum)}
                        >
                          All-in
                        </button>
                      </div>
                      <div className="raise-slider">
                        <div className="raise-slider-heading">
                          <span>TOTAL BET</span>
                          <b>{credits(raiseTo)} cr.</b>
                        </div>
                        <div
                          className="raise-range-shell"
                          style={
                            {
                              "--raise-progress": `${raiseSteps.length > 1 ? (Math.max(0, raiseSteps.indexOf(raiseTo)) / (raiseSteps.length - 1)) * 100 : 0}%`,
                            } as CSSProperties
                          }
                        >
                          <button
                            type="button"
                            aria-label="Palier précédent"
                            disabled={raiseSteps.indexOf(raiseTo) <= 0}
                            onClick={() =>
                              setRaiseTo(
                                raiseSteps[
                                  Math.max(0, raiseSteps.indexOf(raiseTo) - 1)
                                ],
                              )
                            }
                          >
                            −
                          </button>
                          <div className="raise-track">
                            <input
                              aria-label="Total raise amount"
                              aria-valuetext={`${credits(raiseTo)} crédits`}
                              type="range"
                              min={0}
                              max={Math.max(0, raiseSteps.length - 1)}
                              step={1}
                              value={Math.max(0, raiseSteps.indexOf(raiseTo))}
                              onChange={(event) =>
                                setRaiseTo(
                                  raiseSteps[Number(event.target.value)],
                                )
                              }
                            />
                            <div className="raise-ticks" aria-hidden="true">
                              {raiseSteps.map((value, index) => (
                                <i
                                  key={value}
                                  className={value <= raiseTo ? "reached" : ""}
                                  style={{
                                    left: `${raiseSteps.length > 1 ? (index / (raiseSteps.length - 1)) * 100 : 0}%`,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label="Palier suivant"
                            disabled={
                              raiseSteps.indexOf(raiseTo) >=
                              raiseSteps.length - 1
                            }
                            onClick={() =>
                              setRaiseTo(
                                raiseSteps[
                                  Math.min(
                                    raiseSteps.length - 1,
                                    raiseSteps.indexOf(raiseTo) + 1,
                                  )
                                ],
                              )
                            }
                          >
                            +
                          </button>
                        </div>
                        <small>{raiseSteps.length} paliers</small>
                      </div>
                      <button
                        type="button"
                        className="raise-confirm"
                        onClick={() =>
                          raiseTo >= maximum
                            ? sendAction("all-in")
                            : sendAction("raise", raiseTo)
                        }
                      >
                        {raiseTo >= maximum
                          ? "Confirm all-in"
                          : "Confirm raise"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
      {chatOpen && (
        <div
          className="poker-chat-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setChatOpen(false);
          }}
        >
          <aside
            className="poker-chat"
            role="dialog"
            aria-modal="true"
            aria-labelledby="poker-chat-title"
          >
            <div className="chat-heading">
              <div>
                <MessageCircle size={17} />
                <span>
                  <b id="poker-chat-title">Table chat</b>
                  <small>Cette table uniquement</small>
                </span>
              </div>
              <button
                aria-label="Fermer la discussion"
                onClick={() => setChatOpen(false)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="chat-messages">
              {table.chat
                .filter((message) => !blocked.includes(message.playerId))
                .map((message) => (
                  <button
                    key={message.id}
                    onDoubleClick={() =>
                      message.playerId !== game.playerId &&
                      setBlocked([...blocked, message.playerId])
                    }
                    title="Double-cliquez pour masquer ce joueur"
                  >
                    <span>{message.name}</span>
                    <p>{message.text}</p>
                  </button>
                ))}
              {!table.chat.length && (
                <div className="chat-empty">
                  <MessageCircle size={25} />
                  <p>
                    La table est silencieuse.
                    <br />
                    Brisez la glace.
                  </p>
                </div>
              )}
            </div>
            <form onSubmit={submitChat}>
              <input
                autoFocus
                value={chat}
                onChange={(event) => setChat(event.target.value)}
                maxLength={240}
                placeholder="Votre message…"
              />
              <button
                aria-label="Envoyer le message"
                disabled={!chat.trim() || game.pending}
              >
                <Send size={16} />
              </button>
            </form>
            <p className="chat-note">
              Double-cliquez sur un message pour masquer son auteur.
            </p>
            {!!table.history.length && (
              <div className="table-history-mini">
                <span>RECENT HANDS</span>
                {table.history.slice(0, 3).map((item) => (
                  <div key={item.hand}>
                    <b>#{String(item.hand).padStart(3, "0")}</b>
                    <p>
                      {item.winners
                        .map((winner) => `${winner.name} · ${winner.label}`)
                        .join(", ")}
                    </p>
                    <strong>{credits(item.pot)}</strong>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

export function PokerChipStack({
  amount,
  maximum,
  pot = false,
}: {
  amount: number;
  maximum: number;
  pot?: boolean;
}) {
  const stage = chipStackForComposition(undefined, amount, maximum);
  const chipSize = pot ? 42 : 30;
  const columnStep = pot ? 19 : 14;
  const maximumLayers = Math.max(
    ...stage.columns.map((column) => column.layers),
  );
  return (
    <div
      key={amount}
      className={`poker-chip-stack chip-stack-stage-${stage.index} ${pot ? "pot-chips" : "bet-chips"}`}
      role="img"
      aria-label={`${credits(amount)} crédits en jetons`}
      data-chip-stage={stage.index}
      style={
        {
          "--chip-stack-width": `${chipSize + (stage.columns.length - 1) * columnStep + 14}px`,
          "--chip-stack-height": `${chipSize + (maximumLayers - 1) * 4 + 8}px`,
        } as CSSProperties
      }
    >
      <span className="poker-chip-pile" aria-hidden="true">
        {stage.columns.map((column, columnIndex) => (
          <span
            className={`poker-chip-column chip-${column.denomination}`}
            key={`${column.denomination}-${columnIndex}`}
            style={
              {
                ...chipColors(column.denomination),
                "--chip-column-x": `${(columnIndex - (stage.columns.length - 1) / 2) * columnStep}px`,
                "--chip-column-index": columnIndex,
              } as CSSProperties
            }
          >
            {Array.from({ length: column.layers }, (_, layer) => (
              <i
                className="poker-chip-disc"
                key={layer}
                style={{ "--chip-layer": layer } as CSSProperties}
              />
            ))}
          </span>
        ))}
      </span>
      <span className="poker-chip-amount">{credits(amount)}</span>
    </div>
  );
}

function PokerSeatView({
  seat,
  position,
  table,
  playerId,
  dealDelays,
  winningCardIds,
  winnerPlayerIds,
  showdown,
  collectingBet,
  maximumBet,
}: {
  seat?: PokerSeat;
  position: { x: number; y: number };
  table: NonNullable<NonNullable<Game["pokerState"]>["table"]>;
  playerId: string;
  dealDelays: ReadonlyMap<string, number>;
  winningCardIds: ReadonlySet<string>;
  winnerPlayerIds: ReadonlySet<string>;
  showdown: boolean;
  collectingBet: boolean;
  maximumBet: number;
}) {
  const active = !!seat && table.activePlayerId === seat.id;
  const turnSeconds = useCountdownSeconds(active ? table.deadline : null);
  if (!seat)
    return (
      <div
        className="poker-seat empty"
        style={
          {
            "--seat-x": `${position.x}%`,
            "--seat-y": `${position.y}%`,
          } as CSSProperties
        }
      >
        <div className="empty-seat-ring">
          <span />
        </div>
        <small>EN ATTENTE</small>
      </div>
    );
  const mine = seat.id === playerId;

  const winner = winnerPlayerIds.has(seat.id);
  return (
    <div
      className={`poker-seat occupied ${mine ? "mine" : ""} ${active ? "acting" : ""} ${winner ? "winner" : ""} ${seat.status}`}
      style={
        {
          "--seat-x": `${position.x}%`,
          "--seat-y": `${position.y}%`,
        } as CSSProperties
      }
    >
      <div className="poker-hole-cards">
        {seat.cards.map((card, index) => (
          <PlayingCard
            key={`${card.id}-${card.hidden ? "hidden" : "revealed"}`}
            card={card}
            back={!!card.hidden}
            index={index}
            dealDelay={dealDelays.get(card.id)}
            highlighted={winningCardIds.has(card.id)}
            dimmed={showdown && !winningCardIds.has(card.id)}
          />
        ))}
      </div>
      {!!seat.bet && (
        <div className={`seat-bet ${collectingBet ? "is-collecting" : ""}`}>
          <PokerChipStack amount={seat.bet} maximum={maximumBet} />
        </div>
      )}
      {seat.seat === table.button && <span className="dealer-button">D</span>}
      {seat.seat === table.smallBlindSeat && (
        <span className="blind-badge sb">SB</span>
      )}
      {seat.seat === table.bigBlindSeat && (
        <span className="blind-badge bb">BB</span>
      )}
      {winner && (
        <span className="winner-seal" aria-label="Winner">
          <Trophy size={11} />
        </span>
      )}
      <div
        className="poker-player-card"
        data-emote-player={seat.id}
        data-turn-seconds={active ? String(turnSeconds ?? 0) + "s" : undefined}
      >
        {active && (
          <PokerTurnIndicator
            deadline={table.deadline}
            durationMs={(table.mode === "spin" ? 15 : 25) * 1_000}
          />
        )}
        <span className="avatar tiny">
          {seat.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <b>
            {seat.name}
            {mine ? " · Vous" : ""}
          </b>
          <strong>
            <small>Stack</small> {credits(seat.stack)} cr.
          </strong>
        </div>
        {!seat.connected && <i className="offline-dot" />}
      </div>
      {seat.lastAction &&
        seat.lastAction !== "Small blind" &&
        seat.lastAction !== "Big blind" && (
          <span className="last-action">{seat.lastAction}</span>
        )}
    </div>
  );
}

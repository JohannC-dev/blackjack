"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  House,
  Layers2,
  LoaderCircle,
  MessageCircle,
  Send,
  Settings2,
  ShieldCheck,
  Spade,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  Wallet,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { credits } from "@/lib/rules";
import type { PokerAction, PokerMode, PokerSeat } from "@/lib/types";
import { useGame } from "@/lib/use-game";
import type { CasinoView } from "./casino";
import { PlayingCard } from "./playing-card";

type Game = ReturnType<typeof useGame>;
type Navigate = (view: CasinoView) => void;

const CASH_GAMES = [
  { stake: 20, label: "Velours", blinds: "10 / 20", min: 800, max: 2_000 },
  { stake: 100, label: "Salon", blinds: "50 / 100", min: 4_000, max: 10_000 },
  {
    stake: 500,
    label: "Minuit",
    blinds: "250 / 500",
    min: 20_000,
    max: 50_000,
  },
];
const SPIN_BUY_INS = [200, 500, 1_000, 5_000, 25_000];
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

function CasinoRail({
  active,
  onNavigate,
}: {
  active: CasinoView;
  onNavigate: Navigate;
}) {
  return (
    <aside className="rail" aria-label="Navigation principale">
      <button
        className="brand-mark"
        aria-label="Minuit, accueil"
        onClick={() => onNavigate("home")}
      >
        <Spade size={28} fill="currentColor" strokeWidth={1.3} />
      </button>
      <div className="rail-navigation">
        <button
          className={`rail-button ${active === "home" ? "active" : ""}`}
          title="Accueil"
          onClick={() => onNavigate("home")}
        >
          <House size={21} />
        </button>
        <button
          className={`rail-button ${active === "blackjack" ? "active" : ""}`}
          title="Blackjack"
          onClick={() => onNavigate("blackjack")}
        >
          <Layers2 size={22} />
        </button>
        <button
          className={`rail-button ${active === "poker" ? "active" : ""}`}
          title="Poker"
          onClick={() => onNavigate("poker")}
        >
          <Spade size={21} />
        </button>
      </div>
      <div className="rail-bottom">
        <button className="rail-button" title="Paramètres">
          <Settings2 size={20} />
        </button>
        <div className="rail-monogram">M.</div>
      </div>
    </aside>
  );
}

function ClubHeader({ game }: { game: Game }) {
  const balance =
    game.pokerState?.balance ??
    game.state?.players.find((player) => player.id === game.playerId)
      ?.balance ??
    game.profile?.balance ??
    0;
  return (
    <header className="topbar">
      <span className="wordmark">
        MINUIT<span>●</span>
      </span>
      <span className="topbar-divider" />
      <div className="topbar-right">
        <div className="wallet">
          <Wallet size={17} />
          <b>{credits(balance)}</b>
          <span>crédits</span>
          <Coins size={16} className="wallet-coin" />
        </div>
        <div className="profile-avatar" title={game.profile?.name}>
          {game.profile?.name.slice(0, 1).toUpperCase()}
        </div>
      </div>
    </header>
  );
}

export function CasinoHome({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: Navigate;
}) {
  return (
    <div className="casino-shell hub-shell">
      <CasinoRail active="home" onNavigate={onNavigate} />
      <div className="workspace">
        <ClubHeader game={game} />
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
                Deux jeux, un seul portefeuille. Entrez sans attendre — les
                cartes sont déjà prêtes.
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
            <button
              className="game-poster blackjack-poster"
              onClick={() => onNavigate("blackjack")}
            >
              <div className="poster-index">01</div>
              <div className="poster-art">
                <span>21</span>
                <PlayingCard
                  card={{ id: "home-a", rank: 1, suit: "spades" }}
                  decorative
                />
                <PlayingCard
                  card={{ id: "home-k", rank: 13, suit: "hearts" }}
                  decorative
                />
              </div>
              <div className="poster-copy">
                <span>JEU DE TABLE</span>
                <h2>
                  Blackjack
                  <br />
                  Européen
                </h2>
                <p>Le classique de la maison, enrichi de paris annexes.</p>
                <strong>
                  Rejoindre la table <ArrowRight size={17} />
                </strong>
              </div>
            </button>
            <button
              className="game-poster poker-poster"
              onClick={() => onNavigate("poker")}
            >
              <div className="poster-index">02</div>
              <div className="poster-art poker-art">
                <span>♠</span>
                <div className="chip-orbit">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="poster-copy">
                <span>NOUVEAU · MULTIJOUEUR</span>
                <h2>
                  Texas
                  <br />
                  Hold’em
                </h2>
                <p>Cash Game à cinq ou Spin & Play en format éclair.</p>
                <strong>
                  Entrer dans le lobby <ArrowRight size={17} />
                </strong>
              </div>
            </button>
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
      <div className="workspace">
        <ClubHeader game={game} />
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

function PokerLobby({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: Navigate;
}) {
  const [mode, setMode] = useState<PokerMode>("cash");
  const [cashStake, setCashStake] = useState(20);
  const selected = CASH_GAMES.find((game) => game.stake === cashStake)!;
  const [buyIn, setBuyIn] = useState(selected.max);
  const balance = game.pokerState?.balance ?? game.profile?.balance ?? 0;
  useEffect(
    () => setBuyIn(CASH_GAMES.find((item) => item.stake === cashStake)!.max),
    [cashStake],
  );
  return (
    <main className="poker-lobby">
      <button className="lobby-back" onClick={() => onNavigate("home")}>
        <ArrowLeft size={15} /> Tous les jeux
      </button>
      <div className="poker-lobby-heading">
        <div>
          <span className="eyebrow">MINUIT / POKER ROOM</span>
          <h1>
            Texas Hold’em <span>Live</span>
          </h1>
          <p>
            Choisissez votre rythme. Votre place est attribuée automatiquement.
          </p>
        </div>
        <div className="lobby-status">
          <i />
          <span>
            <b>Tables ouvertes</b>
            <small>Matchmaking instantané</small>
          </span>
        </div>
      </div>
      <div className="mode-switch" role="tablist">
        <button
          className={mode === "cash" ? "active" : ""}
          onClick={() => setMode("cash")}
        >
          <CircleDollarSign size={19} />
          <span>
            <b>Cash Game</b>
            <small>2–5 joueurs · blinds fixes</small>
          </span>
        </button>
        <button
          className={mode === "spin" ? "active" : ""}
          onClick={() => setMode("spin")}
        >
          <Sparkles size={19} />
          <span>
            <b>Spin & Play</b>
            <small>3 joueurs · un seul vainqueur</small>
          </span>
        </button>
      </div>
      {mode === "cash" ? (
        <section className="stake-section">
          <div className="section-title">
            <span>01</span>
            <div>
              <h2>Choisissez les limites</h2>
              <p>
                Votre tapis reste séparé de votre portefeuille pendant la
                partie.
              </p>
            </div>
          </div>
          <div className="cash-stakes">
            {CASH_GAMES.map((item) => {
              const locked = balance < item.min;
              return (
                <button
                  key={item.stake}
                  className={`${cashStake === item.stake ? "selected" : ""} ${locked ? "locked" : ""}`}
                  disabled={locked}
                  onClick={() => setCashStake(item.stake)}
                >
                  <span className="stake-name">{item.label}</span>
                  <strong>{item.blinds}</strong>
                  <small>BLINDS</small>
                  <i />
                  <p>
                    {locked
                      ? `${credits(item.min - balance)} cr. manquants`
                      : `${credits(item.min)}–${credits(item.max)} cr.`}
                  </p>
                  {cashStake === item.stake && !locked && <Check size={16} />}
                </button>
              );
            })}
          </div>
          <div className="buyin-panel">
            <div>
              <span>VOTRE BUY-IN</span>
              <strong>
                {credits(buyIn)} <small>cr.</small>
              </strong>
            </div>
            <input
              type="range"
              min={selected.min}
              max={selected.max}
              step={selected.stake}
              value={buyIn}
              onChange={(event) => setBuyIn(Number(event.target.value))}
            />
            <div className="buyin-range">
              <span>40 BB · {credits(selected.min)}</span>
              <span>100 BB · {credits(selected.max)}</span>
            </div>
            <button
              className="button primary poker-play"
              disabled={!game.connected || game.pending || balance < buyIn}
              onClick={() =>
                game.pokerCommand({
                  type: "match",
                  mode: "cash",
                  stake: cashStake,
                  buyIn,
                })
              }
            >
              Trouver une table <ArrowRight size={18} />
            </button>
          </div>
        </section>
      ) : (
        <section className="stake-section">
          <div className="section-title">
            <span>01</span>
            <div>
              <h2>Choisissez votre entrée</h2>
              <p>La roue fixe le prix. Le dernier joueur remporte tout.</p>
            </div>
          </div>
          <div className="spin-stakes">
            {SPIN_BUY_INS.map((stake, index) => {
              const locked = balance < stake;
              return (
                <button
                  key={stake}
                  disabled={locked || game.pending}
                  className={locked ? "locked" : ""}
                  onClick={() =>
                    game.pokerCommand({ type: "match", mode: "spin", stake })
                  }
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Sparkles size={17} />
                  <strong>{credits(stake)}</strong>
                  <small>CRÉDITS</small>
                  {locked ? (
                    <p>{credits(stake - balance)} manquants</p>
                  ) : (
                    <p>
                      Jouer <ChevronRight size={13} />
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          <div className="spin-odds">
            <Trophy size={18} />
            <span>
              <b>Jusqu’à ×1 000</b>
              <small>Multiplicateur tiré avant la première main</small>
            </span>
            <div>
              {[2, 3, 5, 10, 25, 100, 1000].map((value) => (
                <i key={value}>×{value}</i>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
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

function PokerTable({ game }: { game: Game }) {
  const table = game.pokerState!.table!;
  const me = table.seats.find((seat) => seat.id === game.playerId);
  const [now, setNow] = useState(Date.now());
  const [raiseTo, setRaiseTo] = useState(0);
  const [chat, setChat] = useState("");
  const [blocked, setBlocked] = useState<string[]>([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [sound, setSound] = useState(false);
  const previousHand = useRef(table.hand);
  const audioRef = useRef<AudioContext | null>(null);
  const previousAudioState = useRef({
    hand: table.hand,
    cards: table.community.length,
    active: table.activePlayerId,
    phase: table.phase,
    wheel: table.wheelSpinning,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const toCall = me ? Math.max(0, table.currentBet - me.bet) : 0;
  const minimumRaise = table.currentBet + table.minRaise;
  const maximum = me ? me.bet + me.stack : 0;
  useEffect(
    () => setRaiseTo(Math.min(maximum, Math.max(minimumRaise, table.bigBlind))),
    [minimumRaise, maximum, table.bigBlind],
  );
  useEffect(() => {
    previousHand.current = table.hand;
  }, [table.hand]);
  useEffect(() => {
    const previous = previousAudioState.current;
    previousAudioState.current = {
      hand: table.hand,
      cards: table.community.length,
      active: table.activePlayerId,
      phase: table.phase,
      wheel: table.wheelSpinning,
    };
    const context = audioRef.current;
    if (!sound || !context) return;
    const tone = (frequency: number, duration = 0.08) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        context.currentTime + duration,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    };
    if (table.wheelSpinning && !previous.wheel) tone(220, 0.35);
    else if (table.phase === "complete" && previous.phase !== "complete")
      tone(760, 0.4);
    else if (table.community.length > previous.cards) tone(520);
    else if (table.hand > previous.hand) tone(340);
    else if (
      table.activePlayerId === game.playerId &&
      previous.active !== game.playerId
    )
      tone(660, 0.14);
  }, [
    game.playerId,
    sound,
    table.activePlayerId,
    table.community.length,
    table.hand,
    table.phase,
    table.wheelSpinning,
  ]);
  const seconds = table.deadline
    ? Math.max(0, Math.ceil((table.deadline - now) / 1000))
    : 0;
  const myTurn = table.activePlayerId === game.playerId;
  const positions = table.mode === "spin" ? THREE_POSITIONS : FIVE_POSITIONS;
  const totalSeats = table.mode === "spin" ? 3 : 5;
  const sendAction = (action: PokerAction, amount?: number) =>
    game.pokerCommand({ type: "action", action, amount });
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
  return (
    <main className="poker-table-page">
      <div className="poker-table-heading">
        <button
          className="lobby-back"
          onClick={() => game.pokerCommand({ type: "leave" })}
        >
          <ArrowLeft size={15} /> Quitter la table
        </button>
        <div>
          <span className="eyebrow">
            {table.mode === "spin" ? "SPIN & PLAY" : "CASH GAME"} / TABLE{" "}
            {table.id.slice(-4)}
          </span>
          <h1>
            {table.mode === "spin"
              ? `${credits(table.stake)} crédits · ×${table.wheelMultiplier ?? "?"}`
              : `Blinds ${table.smallBlind} / ${table.bigBlind}`}
          </h1>
        </div>
        <button
          type="button"
          className={`poker-sound ${sound ? "active" : ""}`}
          aria-label={
            sound ? "Couper les sons Poker" : "Activer les sons Poker"
          }
          onClick={() => {
            audioRef.current ??= new AudioContext();
            void audioRef.current.resume();
            setSound(!sound);
          }}
        >
          <Volume2 size={15} />
        </button>
        <div className="table-players-count">
          <Users size={16} /> {table.seats.length} / {totalSeats}
        </div>
      </div>
      <div className={`poker-room-layout ${chatOpen ? "chat-visible" : ""}`}>
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
                  />
                ) : (
                  <div className="community-placeholder" key={index}>
                    {index < 3 ? "F" : index === 3 ? "T" : "R"}
                  </div>
                ),
              )}
              <div className="pot-display">
                <span>POT TOTAL</span>
                <b>{credits(table.pot)} cr.</b>
              </div>
            </div>
            {seatSlots.map((seat, index) => (
              <PokerSeatView
                key={index}
                seat={seat}
                position={positions[index]}
                table={table}
                playerId={game.playerId}
              />
            ))}
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
          <div className="poker-status">
            <span className={myTurn ? "active" : ""} />
            <div>
              <b>{myTurn ? "À vous de parler" : table.message}</b>
              <small>
                {table.phase === "waiting"
                  ? "La main démarre dès qu’un adversaire arrive."
                  : `${table.phase.toUpperCase()} · Main ${String(table.hand).padStart(3, "0")}`}
              </small>
            </div>
            {table.deadline && (
              <strong>
                <Clock3 size={14} /> {seconds}s
              </strong>
            )}
          </div>
          <div className={`poker-actions ${myTurn ? "enabled" : ""}`}>
            <button
              disabled={!myTurn || game.pending}
              onClick={() => sendAction("fold")}
              className="fold"
            >
              Fold
            </button>
            <button
              disabled={!myTurn || game.pending || !!toCall}
              onClick={() => sendAction("check")}
            >
              Check
            </button>
            <button
              disabled={!myTurn || game.pending || !toCall}
              onClick={() => sendAction("call")}
            >
              <span>Call</span>
              <small>{credits(Math.min(toCall, me?.stack ?? 0))}</small>
            </button>
            <div className="raise-control">
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setRaiseTo(
                      Math.min(
                        maximum,
                        Math.max(minimumRaise, Math.round(table.pot / 2)),
                      ),
                    )
                  }
                >
                  ½
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRaiseTo(
                      Math.min(maximum, Math.max(minimumRaise, table.pot)),
                    )
                  }
                >
                  Pot
                </button>
                <button type="button" onClick={() => setRaiseTo(maximum)}>
                  All-in
                </button>
              </div>
              <input
                type="range"
                min={Math.min(minimumRaise, maximum)}
                max={Math.max(minimumRaise, maximum)}
                value={raiseTo || 0}
                onChange={(event) => setRaiseTo(Number(event.target.value))}
                disabled={!myTurn || maximum <= table.currentBet}
              />
            </div>
            <button
              disabled={!myTurn || game.pending || maximum <= table.currentBet}
              onClick={() =>
                raiseTo >= maximum
                  ? sendAction("all-in")
                  : sendAction("raise", raiseTo)
              }
              className="raise"
            >
              <span>
                {raiseTo >= maximum
                  ? "All-in"
                  : table.currentBet
                    ? "Raise"
                    : "Miser"}
              </span>
              <small>{credits(raiseTo)}</small>
            </button>
          </div>
        </section>
        <aside className={`poker-chat ${chatOpen ? "open" : ""}`}>
          <button
            className="chat-toggle"
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageCircle size={17} /> Discussion
          </button>
          <div className="chat-heading">
            <div>
              <MessageCircle size={17} />
              <span>
                <b>Discussion</b>
                <small>Table uniquement</small>
              </span>
            </div>
            <button onClick={() => setChatOpen(false)}>
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
              value={chat}
              onChange={(event) => setChat(event.target.value)}
              maxLength={240}
              placeholder="Votre message…"
            />
            <button disabled={!chat.trim() || game.pending}>
              <Send size={16} />
            </button>
          </form>
          <p className="chat-note">
            Double-cliquez sur un message pour masquer son auteur.
          </p>
          {!!table.history.length && (
            <div className="table-history-mini">
              <span>DERNIÈRES MAINS</span>
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
    </main>
  );
}

function PokerSeatView({
  seat,
  position,
  table,
  playerId,
}: {
  seat?: PokerSeat;
  position: { x: number; y: number };
  table: NonNullable<NonNullable<Game["pokerState"]>["table"]>;
  playerId: string;
}) {
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
  const active = table.activePlayerId === seat.id;
  return (
    <div
      className={`poker-seat occupied ${mine ? "mine" : ""} ${active ? "active" : ""} ${seat.status}`}
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
            key={card.id}
            card={card}
            back={!!card.hidden}
            index={index}
          />
        ))}
      </div>
      {!!seat.bet && (
        <div className="seat-bet">
          <i />
          <b>{credits(seat.bet)}</b>
        </div>
      )}
      {seat.seat === table.button && <span className="dealer-button">D</span>}
      {seat.seat === table.smallBlindSeat && (
        <span className="blind-badge sb">SB</span>
      )}
      {seat.seat === table.bigBlindSeat && (
        <span className="blind-badge bb">BB</span>
      )}
      <div className="poker-player-card">
        <span className="avatar tiny">
          {seat.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <b>
            {seat.name}
            {mine ? " · Vous" : ""}
          </b>
          <strong>{credits(seat.stack)} cr.</strong>
        </div>
        {!seat.connected && <i className="offline-dot" />}
      </div>
      {seat.lastAction && (
        <span className="last-action">{seat.lastAction}</span>
      )}
    </div>
  );
}

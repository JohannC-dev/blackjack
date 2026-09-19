"use client";

import {
  ArrowLeft,
  ArrowRight,
  Coins,
  LockKeyhole,
  LoaderCircle,
  Spade,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { credits } from "@/lib/rules";
import type { PokerCommand } from "@/lib/types";
import type { useGame } from "@/lib/use-game";
import type { CasinoView } from "./casino";
import styles from "./poker-lobby.module.css";
import { RoomArt } from "./room-art";

const ROOMS = [
  {
    stake: 20,
    name: "Velours",
    blinds: "10 / 20",
    min: 800,
    max: 2_000,
    theme: "velvet",
  },
  {
    stake: 100,
    name: "Salon",
    blinds: "50 / 100",
    min: 4_000,
    max: 10_000,
    theme: "salon",
  },
  {
    stake: 500,
    name: "Minuit",
    blinds: "250 / 500",
    min: 20_000,
    max: 50_000,
    theme: "midnight",
  },
] as const;
const SPINS = [
  { stake: 200, theme: "salon" },
  { stake: 500, theme: "velvet" },
  { stake: 1_000, theme: "rose" },
  { stake: 5_000, theme: "ocean" },
  { stake: 25_000, theme: "midnight" },
];

export function PokerLobby({
  game,
  onNavigate,
}: {
  game: ReturnType<typeof useGame>;
  onNavigate: (view: CasinoView) => void;
}) {
  const [cashOpen, setCashOpen] = useState(false);
  const [buyInBB, setBuyInBB] = useState(100);
  const [joining, setJoining] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const cashButtonRef = useRef<HTMLButtonElement>(null);
  const balance = game.pokerState?.balance ?? game.profile?.balance ?? 0;
  const busy = game.pending || joining !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (cashOpen) dialog?.showModal();
    else if (dialog?.open) dialog.close();
  }, [cashOpen]);

  const enter = async (key: string, command: PokerCommand) => {
    if (!game.connected || game.pending || submitting.current) return;
    submitting.current = true;
    setJoining(key);
    try {
      await game.pokerCommand(command);
    } finally {
      submitting.current = false;
      setJoining(null);
    }
  };

  const closeCash = () => {
    setCashOpen(false);
    cashButtonRef.current?.focus();
  };

  return (
    <main className={`poker-lobby ${styles.lobby}`}>
      <div className={styles.breadcrumb}>
        <button onClick={() => onNavigate("home")}>
          <ArrowLeft size={15} /> Tous les jeux
        </button>
        <span
          className={`${styles.connection} ${game.connected ? styles.online : ""}`}
          role="status"
        >
          <i /> {game.connected ? "Connecté au club" : "Connexion en cours…"}
        </span>
      </div>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>
            LE CLUB MINUIT <span>/</span> POKER
          </span>
          <h1>
            Texas Hold’em
            <span className={styles.titleSuit} aria-hidden="true">
              ♠
            </span>
          </h1>
          <p>Installez-vous en Cash Game ou lancez un Spin & Play.</p>
        </div>
        <div className={styles.headingNote}>
          <span>NO LIMIT</span>
          <span>TOUTE LA NUIT.</span>
        </div>
      </header>
      <section aria-labelledby="games-title">
        <div className={styles.sectionHeading}>
          <h2 id="games-title">À vous de jouer</h2>
          <span>
            <Users size={13} /> Parties multijoueurs
          </span>
        </div>
        <div className={styles.games}>
          <button
            ref={cashButtonRef}
            className={`${styles.gameCard} ${styles.velvet} ${styles.cashCard}`}
            aria-label="Cash Game, choisir le plafond"
            aria-haspopup="dialog"
            disabled={busy}
            onClick={() => setCashOpen(true)}
          >
            <div className={styles.roomTopline}>
              <span>
                <Spade size={13} fill="currentColor" /> CASH GAME
              </span>
              <span>2–5 joueurs</span>
            </div>
            <RoomArt theme="velvet" />
            <div className={styles.gameCopy}>
              <h3>Cash Game</h3>
              <p>Votre rythme. Vos limites.</p>
              <div className={styles.gameDetail}>
                <span>3 plafonds au choix</span>
                <span>Dès 800 cr.</span>
              </div>
              <div className={styles.roomFooter}>
                <span>Choisir le plafond</span>
                <ArrowRight size={17} />
              </div>
            </div>
          </button>
          {SPINS.map(({ stake, theme }) => {
            const locked = balance < stake;
            return (
              <button
                key={stake}
                className={`${styles.gameCard} ${styles[theme]} ${locked ? styles.locked : ""}`}
                aria-label={`Spin & Play, ${credits(stake)} crédits${locked ? `, ${credits(stake - balance)} crédits manquants` : ""}`}
                disabled={locked || busy || !game.connected}
                onClick={() =>
                  void enter(`spin-${stake}`, {
                    type: "match",
                    mode: "spin",
                    stake,
                  })
                }
              >
                <div className={styles.roomTopline}>
                  <span>
                    <Zap size={13} /> SPIN & PLAY
                  </span>
                  <span>Jusqu’à ×1 000</span>
                </div>
                <RoomArt theme={theme} />
                <div className={styles.gameCopy}>
                  <h3>
                    {credits(stake)} <small>crédits</small>
                  </h3>
                  <p>3 joueurs. Un seul vainqueur.</p>
                  <div className={styles.gameDetail}>
                    <span>Prix jusqu’à</span>
                    <strong>{credits(stake * 1_000)} cr.</strong>
                  </div>
                  <div className={styles.roomFooter}>
                    <span>
                      {locked ? (
                        <>
                          <LockKeyhole size={12} /> {credits(stake - balance)}{" "}
                          cr. manquants
                        </>
                      ) : joining === `spin-${stake}` ? (
                        <>
                          <LoaderCircle size={14} className={styles.spinner} />{" "}
                          En route…
                        </>
                      ) : (
                        "Jouer maintenant"
                      )}
                    </span>
                    {!locked && <ArrowRight size={17} />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <footer className={styles.footer}>
        <span>
          <Coins size={13} /> Crédits fictifs
        </span>
        <i />
        <span>
          Cash Game à votre rythme · Spin & Play, le dernier joueur remporte
          tout.
        </span>
        <span className={styles.footerBrand}>MINUIT POKER CLUB</span>
      </footer>

      <dialog
        ref={dialogRef}
        className={styles.cashDialog}
        aria-labelledby="cash-title"
        onCancel={(event) => {
          event.preventDefault();
          closeCash();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            closeCash();
        }}
      >
        <div className={styles.dialogHeader}>
          <span className={styles.eyebrow}>CASH GAME · 2–5 JOUEURS</span>
          <button
            autoFocus
            aria-label="Fermer le choix du plafond"
            onClick={closeCash}
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="cash-title">Choisissez votre plafond.</h2>
        <p className={styles.dialogIntro}>
          Un clic sur le salon, et vous prenez place.
        </p>
        <div className={styles.limits}>
          {ROOMS.map((room) => {
            const locked = balance < room.min;
            const buyIn = Math.max(
              room.min,
              Math.min(room.stake * buyInBB, Math.floor(balance)),
            );
            return (
              <button
                key={room.stake}
                className={`${styles.limitCard} ${styles[room.theme]} ${locked ? styles.locked : ""}`}
                disabled={locked || busy || !game.connected}
                aria-label={`${room.name}, plafond ${credits(room.max)} crédits, blinds ${room.blinds}${locked ? `, ${credits(room.min - balance)} crédits manquants` : `, entrer avec ${credits(buyIn)} crédits`}`}
                onClick={() =>
                  void enter(`cash-${room.stake}`, {
                    type: "match",
                    mode: "cash",
                    stake: room.stake,
                    buyIn,
                  })
                }
              >
                <span className={styles.limitName}>
                  {room.name}
                  <Spade size={14} />
                </span>
                <strong>
                  {credits(room.max)} <small>cr.</small>
                </strong>
                <span className={styles.limitCaption}>MAXIMUM BUY-IN</span>
                <div className={styles.limitBlinds}>
                  <span>Blinds</span>
                  <b>{room.blinds}</b>
                </div>
                <div className={styles.roomFooter}>
                  <span>
                    {locked ? (
                      <>
                        <LockKeyhole size={12} /> {credits(room.min - balance)}{" "}
                        cr. manquants
                      </>
                    ) : joining === `cash-${room.stake}` ? (
                      <>
                        <LoaderCircle size={14} className={styles.spinner} /> En
                        route…
                      </>
                    ) : (
                      `Entrer · ${credits(buyIn)} cr.`
                    )}
                  </span>
                  {!locked && <ArrowRight size={16} />}
                </div>
              </button>
            );
          })}
        </div>
        <details className={styles.customBuyIn}>
          <summary>
            Personnaliser mon buy-in <span>{buyInBB} BB</span>
          </summary>
          <div>
            <label htmlFor="poker-buyin">Starting stack in big blinds</label>
            <input
              id="poker-buyin"
              type="range"
              min={40}
              max={100}
              step={1}
              value={buyInBB}
              disabled={busy}
              onChange={(event) => setBuyInBB(Number(event.target.value))}
            />
            <div className={styles.rangeLabels}>
              <span>40 BB</span>
              <span>100 BB</span>
            </div>
          </div>
        </details>
        <p className={styles.dialogFootnote}>
          <Coins size={13} /> L’entrée s’adapte à votre solde. Votre stack vous
          est rendu en quittant la table.
        </p>
        {game.error && (
          <p className={styles.dialogError} role="alert">
            {game.error}
          </p>
        )}
      </dialog>
    </main>
  );
}

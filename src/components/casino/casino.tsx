"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BlackjackIcon } from "../ui/blackjack-icon";
import { Modal } from "../ui/modal";
import { ServerClockProvider } from "../ui/countdown";
import { Coins, LoaderCircle, Spade } from "lucide-react";
import {
  getClubBalance,
  INITIAL_CREDIT_BALANCE,
  REFILL_BALANCE,
  REFILL_THRESHOLD,
} from "@/lib/chips";
import { credits } from "@/lib/rules";
import type { CasinoView } from "@/lib/navigation";
import { useGame } from "@/lib/use-game";
import {
  BlackjackCasino,
  WelcomeAuthModal,
} from "../games/blackjack/blackjack-casino";
import { MinesCasino } from "../games/mines/mines-casino";
import { PlinkoCasino } from "../games/plinko/plinko-casino";
import { CasinoHome, PokerCasino } from "../games/poker/poker-casino";
import { RouletteCasino } from "../games/roulette/roulette-casino";
import { TowerCasino } from "../games/tower/tower-casino";
import { ChickenCasino } from "../games/chicken/chicken-casino";
import { SocialProvider } from "../social/social-provider";
import { DailyProvider } from "../daily/daily-provider";
import { CardBackSkin } from "../ui/playing-card";
import { useMySkins } from "@/lib/cosmetics-api";
import { CasinoLayout } from "../ui";

const shellClasses: Record<CasinoView, string> = {
  home: "hub-shell",
  blackjack: "blackjack-casino-shell",
  poker: "poker-shell",
  tower: "tower-shell",
  mines: "mines-shell",
  roulette: "roulette-shell",
  chicken: "chicken-shell",
  plinko: "plinko-shell",
};

export function Casino() {
  const game = useGame();
  const mySkins = useMySkins();
  const [view, setView] = useState<CasinoView>("home");
  const [blackjackRulesRequest, setBlackjackRulesRequest] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [plinkoHeaderBalance, setPlinkoHeaderBalance] = useState<number | null>(
    null,
  );
  const casinoShellRef = useRef<HTMLDivElement>(null);
  const [confirmPokerLeave, setConfirmPokerLeave] = useState(false);
  const [leavingPoker, setLeavingPoker] = useState(false);
  const [pendingView, setPendingView] = useState<CasinoView | null>(null);
  const [showRefill, setShowRefill] = useState(false);
  const [refillDismissed, setRefillDismissed] = useState(false);
  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === casinoShellRef.current);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement)
        setIsFullscreen(false);
    };

    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);
  useEffect(() => {
    if (view === "blackjack") return;
    setBlackjackRulesRequest(0);
    setIsFullscreen(false);
    if (document.fullscreenElement === casinoShellRef.current)
      void document.exitFullscreen().catch(() => undefined);
  }, [view]);
  useEffect(() => {
    if (view !== "plinko") setPlinkoHeaderBalance(null);
  }, [view]);
  const toggleFullscreen = useCallback(async () => {
    const shell = casinoShellRef.current;
    if (!shell) return;

    if (isFullscreen) {
      setIsFullscreen(false);
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => undefined);
      return;
    }

    setIsFullscreen(true);
    if (document.fullscreenEnabled && shell.requestFullscreen) {
      try {
        await shell.requestFullscreen();
      } catch {
        // Keep the layout-only fullscreen mode when the browser blocks the API.
      }
    }
  }, [isFullscreen]);
  const canRefill =
    !!game.profile && game.balance !== null && game.balance < REFILL_THRESHOLD;
  const blackjackPlayer = game.state?.players.find(
    (player) => player.id === game.playerId,
  );
  const headerBalance =
    view === "blackjack"
      ? (game.balance ??
        blackjackPlayer?.balance ??
        game.profile?.balance ??
        INITIAL_CREDIT_BALANCE)
      : view === "plinko"
        ? (plinkoHeaderBalance ?? getClubBalance(game))
        : getClubBalance(game);
  const headerName =
    view === "blackjack"
      ? (blackjackPlayer?.name ?? game.profile?.name ?? "M")
      : (game.profile?.name ?? "");
  useEffect(() => {
    if (!canRefill) {
      setShowRefill(false);
      setRefillDismissed(false);
    } else if (!refillDismissed) {
      setShowRefill(true);
    }
  }, [canRefill, refillDismissed]);
  const pokerStateRef = useRef(game.pokerState);
  pokerStateRef.current = game.pokerState;
  const navigate = useCallback((next: CasinoView) => {
    const pokerState = pokerStateRef.current;
    if (next !== "poker" && pokerState && pokerState.status !== "lobby") {
      setPendingView(next);
      setConfirmPokerLeave(true);
      return;
    }
    setView(next);
  }, []);
  const content =
    view === "home" ? (
      <CasinoHome game={game} onNavigate={navigate} />
    ) : view === "poker" ? (
      <PokerCasino game={game} onNavigate={navigate} />
    ) : view === "tower" ? (
      <TowerCasino game={game} />
    ) : view === "chicken" ? (
      <ChickenCasino game={game} />
    ) : view === "mines" ? (
      <MinesCasino game={game} />
    ) : view === "plinko" ? (
      // Another account gets a fresh board: history, balls in flight, series.
      <PlinkoCasino
        key={game.profile?.token ?? ""}
        game={game}
        onSettledBalanceChange={setPlinkoHeaderBalance}
      />
    ) : view === "roulette" ? (
      <RouletteCasino game={game} />
    ) : (
      <BlackjackCasino
        game={game}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        rulesRequest={blackjackRulesRequest}
      />
    );
  const pokerExitMessage = game.pokerState?.queue
    ? "Votre recherche sera annul\u00e9e et votre buy-in sera r\u00e9cup\u00e9r\u00e9."
    : game.pokerState?.table?.mode === "cash"
      ? "Votre place sera lib\u00e9r\u00e9e et votre stack restant sera recr\u00e9dit\u00e9."
      : "Vous abandonnerez le tournoi et votre buy-in ne sera pas récupéré.";
  const pokerExitDestination =
    pendingView === "mines"
      ? "le jeu de la Mine"
      : pendingView === "chicken"
        ? "Chicken"
        : pendingView === "plinko"
          ? "le Plinko"
          : pendingView === "roulette"
            ? "la Roulette"
            : pendingView === "home"
              ? "l\u2019accueil du club"
              : "le Blackjack";

  return (
    <ServerClockProvider offset={game.serverTimeOffset}>
      <SocialProvider game={game} view={view} onNavigate={navigate}>
        <DailyProvider socket={game.socket} view={view}>
          <CardBackSkin.Provider value={mySkins?.["card-back"]}>
            <CasinoLayout
              active={view}
              shellClassName={shellClasses[view]}
              isFullscreen={isFullscreen}
              shellRef={casinoShellRef}
              balance={headerBalance}
              name={headerName}
              onSignOut={game.signOut}
              onNavigate={navigate}
              onRules={
                view === "blackjack"
                  ? () => setBlackjackRulesRequest((request) => request + 1)
                  : undefined
              }
              blackjackLabel={
                view === "home"
                  ? "Table de cartes"
                  : game.profile
                    ? "Blackjack"
                    : "Table de cartes"
              }
            >
              {content}
            </CasinoLayout>
          </CardBackSkin.Provider>
          {game.loaded && !game.profile && <WelcomeAuthModal game={game} />}
          {canRefill && refillDismissed && !showRefill && (
            <button
              type="button"
              className="button primary refill-reminder"
              onClick={() => {
                setRefillDismissed(false);
                setShowRefill(true);
              }}
            >
              <Coins size={16} />
              Recaver
            </button>
          )}
          {canRefill && showRefill && (
            <Modal
              title="Recaver"
              onClose={() => {
                setShowRefill(false);
                setRefillDismissed(true);
              }}
            >
              <span className="modal-emblem">
                <Coins size={26} />
              </span>
              <span className="section-kicker">SOLDE INSUFFISANT</span>
              <h2>Reprenez la partie.</h2>
              <p className="modal-intro">
                Votre solde est sous {credits(REFILL_THRESHOLD)} crédits. Vous
                pouvez le remettre à {credits(REFILL_BALANCE)} crédits.
              </p>
              <div className="leave-poker-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={game.pending}
                  onClick={() => {
                    setShowRefill(false);
                    setRefillDismissed(true);
                  }}
                >
                  Plus tard
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={!game.connected || game.pending}
                  onClick={async () => {
                    if (await game.refill()) {
                      setShowRefill(false);
                      setRefillDismissed(true);
                    }
                  }}
                >
                  {game.pending ? (
                    <LoaderCircle size={16} className="spinner" />
                  ) : (
                    <Coins size={16} />
                  )}
                  Recaver à {credits(REFILL_BALANCE)} cr.
                </button>
              </div>
            </Modal>
          )}
          {confirmPokerLeave && (
            <Modal
              title="Quitter la partie de poker ?"
              className="leave-poker-modal"
              onClose={
                leavingPoker
                  ? undefined
                  : () => {
                      setConfirmPokerLeave(false);
                      setPendingView(null);
                    }
              }
            >
              <span className="modal-emblem">
                <Spade size={26} fill="currentColor" />
              </span>
              <span className="section-kicker">PARTIE EN COURS</span>
              <h2>Quitter la partie de poker ?</h2>
              <p className="modal-intro">
                {pokerExitMessage} Voulez-vous vraiment rejoindre{" "}
                {pokerExitDestination} ?
              </p>
              <div className="leave-poker-actions">
                <button
                  type="button"
                  className="button secondary"
                  autoFocus
                  disabled={leavingPoker}
                  onClick={() => {
                    setConfirmPokerLeave(false);
                    setPendingView(null);
                  }}
                >
                  Rester au poker
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={leavingPoker}
                  onClick={async () => {
                    setLeavingPoker(true);
                    const left = await game.pokerCommand({ type: "leave" });
                    setLeavingPoker(false);
                    if (!left) return;
                    setConfirmPokerLeave(false);
                    setView(pendingView ?? "blackjack");
                    setPendingView(null);
                  }}
                >
                  {leavingPoker ? (
                    <LoaderCircle size={16} className="spinner" />
                  ) : (
                    <BlackjackIcon />
                  )}
                  {pendingView === "blackjack"
                    ? "Quitter et jouer au Blackjack"
                    : "Quitter et rejoindre " + pokerExitDestination}
                </button>
              </div>
            </Modal>
          )}
        </DailyProvider>
      </SocialProvider>
    </ServerClockProvider>
  );
}

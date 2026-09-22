"use client";

import { useCallback, useRef, useState } from "react";
import { BlackjackIcon } from "../shared/casino/blackjack-icon";
import { Modal } from "../shared/casino/modal";
import { ServerClockProvider } from "../shared/casino/countdown";
import { LoaderCircle, Spade } from "lucide-react";
import type { CasinoView } from "@/lib/navigation";
import { useGame } from "@/lib/use-game";
import { BlackjackCasino } from "../games/blackjack/blackjack-casino";
import { MinesCasino } from "../games/mines/mines-casino";
import { CasinoHome, PokerCasino } from "../games/poker/poker-casino";
import { RouletteCasino } from "../games/roulette/roulette-casino";
import { TowerCasino } from "../games/tower/tower-casino";

export function Casino() {
  const game = useGame();
  const [view, setView] = useState<CasinoView>("home");
  const [confirmPokerLeave, setConfirmPokerLeave] = useState(false);
  const [leavingPoker, setLeavingPoker] = useState(false);
  const [pendingView, setPendingView] = useState<CasinoView | null>(null);
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
  if (!game.profile)
    return (
      <ServerClockProvider offset={game.serverTimeOffset}>
        <BlackjackCasino game={game} onNavigate={navigate} />
      </ServerClockProvider>
    );
  const content =
    view === "home" ? (
      <CasinoHome game={game} onNavigate={navigate} />
    ) : view === "poker" ? (
      <PokerCasino game={game} onNavigate={navigate} />
    ) : view === "tower" ? (
      <TowerCasino game={game} onNavigate={navigate} />
    ) : view === "mines" ? (
      <MinesCasino game={game} onNavigate={navigate} />
    ) : view === "roulette" ? (
      <RouletteCasino game={game} onNavigate={navigate} />
    ) : (
      <BlackjackCasino game={game} onNavigate={navigate} />
    );
  const pokerExitMessage = game.pokerState?.queue
    ? "Votre recherche sera annul\u00e9e et votre buy-in sera r\u00e9cup\u00e9r\u00e9."
    : game.pokerState?.table?.mode === "cash"
      ? "Votre place sera lib\u00e9r\u00e9e et votre stack restant sera recr\u00e9dit\u00e9."
      : "Vous abandonnerez le tournoi et votre buy-in ne sera pas rÃ©cupÃ©rÃ©.";
  const pokerExitDestination =
    pendingView === "mines"
      ? "le jeu de la Mine"
      : pendingView === "roulette"
        ? "la Roulette"
        : pendingView === "home"
          ? "l\u2019accueil du club"
          : "le Blackjack";

  return (
    <ServerClockProvider offset={game.serverTimeOffset}>
      <>
        {content}
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
      </>
    </ServerClockProvider>
  );
}

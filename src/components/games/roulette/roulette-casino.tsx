"use client";

import { Check, CircleDot, Repeat2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { playCasinoSound, preloadCasinoSounds } from "@/lib/casino-audio";
import { playRouletteSpin } from "@/lib/roulette-audio";
import { useGameAudio } from "@/lib/audio-context";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { PlayerMenu } from "@/components/social/player-menu";
import { CASINO_CHIP_DENOMINATIONS, mergeChipCounts } from "@/lib/chips";
import {
  ROULETTE_MAX_BETS,
  ROULETTE_MAX_PER_SPOT,
  ROULETTE_MIN_CHIP,
  rouletteBetId,
  rouletteTotal,
  type RouletteBet,
  type RouletteBetKind,
} from "@/lib/roulette";
import { credits } from "@/lib/rules";
import type { ChipCount } from "@/lib/types";
import { useGame } from "@/lib/use-game";
import { Chip } from "../../ui/chip";
import { RouletteFx, ROULETTE_FX } from "./roulette-fx";
import { CountdownText } from "../../ui/countdown";
import {
  GameActionButton,
  GameControlGroup,
  GameControlsBar,
} from "../../ui/game-controls";
import { getClubBalance } from "../../ui";
import { RouletteBoard, betMap, betChipMap } from "./roulette-board";
import { colorName, numberTone, RouletteWheel } from "./roulette-wheel";

type Game = ReturnType<typeof useGame>;
export { targetAt, zeroTargetAt } from "./roulette-board";

export function RouletteCasino({ game }: { game: Game }) {
  const table = game.rouletteState;
  const balance = getClubBalance(game);
  const { enterRoulette, leaveRoulette } = game;
  const [chip, setChip] = useState<number>(CASINO_CHIP_DENOMINATIONS[0]);
  const [undo, setUndo] = useState<RouletteBet[][]>([]);
  const { enabled: sound, contextRef: audioRef } =
    useGameAudio(preloadCasinoSounds);
  const soundRef = useRef(false);
  soundRef.current = sound;
  const stageRef = useRef<HTMLDivElement>(null);

  // Sitting at the table follows the view, as the Tower does.
  useEffect(() => {
    enterRoulette();
    return leaveRoulette;
  }, [enterRoulette, leaveRoulette]);

  const play = useCallback(
    (effect: Parameters<typeof playCasinoSound>[1], count = 1) => {
      if (soundRef.current && audioRef.current)
        playCasinoSound(audioRef.current, effect, count);
    },
    [],
  );

  const me = table?.players.find((player) => player.id === game.playerId);
  const others = table?.players.filter((player) => player.id !== me?.id) ?? [];
  const myBets = me?.bets ?? [];
  const total = rouletteTotal(myBets);
  const phase = table?.phase ?? "betting";
  const betting = phase === "betting";
  const ready = !!me?.ready;
  const canBet = !!me && betting && !ready && !game.pending && game.connected;
  const myResult = table?.results.find((entry) => entry.playerId === me?.id);
  const result = phase === "settled" ? (table?.number ?? null) : null;

  // New round: the undo stack only covers the current layout.
  const round = table?.round ?? 0;
  useEffect(() => setUndo([]), [round]);

  // Sounds follow the server phases.
  const previousPhase = useRef(phase);
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (previous === phase) return;
    if (phase === "spinning" && soundRef.current && audioRef.current)
      playRouletteSpin(audioRef.current);
    if (phase === "settled") {
      if ((myResult?.payout ?? 0) > 0) {
        const timer = window.setTimeout(
          () => play("chips", 2),
          ROULETTE_FX.merge,
        );
        return () => window.clearTimeout(timer);
      }
    }
  }, [myResult?.payout, phase, play]);

  const send = async (next: RouletteBet[]) => {
    const before = myBets;
    const ok = await game.rouletteCommand({ type: "bets", bets: next });
    if (ok) setUndo((stack) => [...stack.slice(-40), before]);
    return ok;
  };
  const place = (kind: RouletteBetKind, selection: string) => {
    if (!canBet) return;
    const id = rouletteBetId({ kind, selection });
    const staked = myBets.find((bet) => rouletteBetId(bet) === id)?.amount ?? 0;
    if (staked + chip > ROULETTE_MAX_PER_SPOT) {
      game.setError(
        `La mise est limitée à ${credits(ROULETTE_MAX_PER_SPOT)} crédits par case.`,
      );
      return;
    }
    if (total + chip > balance) {
      game.setError("Votre solde est insuffisant pour ce jeton.");
      return;
    }
    const existing = staked > 0;
    if (!existing && myBets.length >= ROULETTE_MAX_BETS) return;
    play("chips");
    void send(
      existing
        ? myBets.map((bet) =>
            rouletteBetId(bet) === id
              ? {
                  ...bet,
                  amount: bet.amount + chip,
                  chips: mergeChipCounts(
                    bet.chips ?? [{ denomination: bet.amount, count: 1 }],
                    [{ denomination: chip, count: 1 }],
                  ),
                }
              : bet,
          )
        : [
            ...myBets,
            {
              kind,
              selection,
              amount: chip,
              chips: [{ denomination: chip, count: 1 }],
            },
          ],
    );
  };
  const remove = (kind: RouletteBetKind, selection: string) => {
    if (!canBet) return;
    const id = rouletteBetId({ kind, selection });
    void send(myBets.filter((bet) => rouletteBetId(bet) !== id));
  };
  const undoLast = () => {
    const previous = undo.at(-1);
    if (!previous || !canBet) return;
    void game
      .rouletteCommand({ type: "bets", bets: previous })
      .then((ok) => ok && setUndo((stack) => stack.slice(0, -1)));
  };
  const repeat = () => {
    if (!canBet) return;
    const before = myBets;
    play("chips");
    void game
      .rouletteCommand({ type: "repeat" })
      .then((ok) => ok && setUndo((stack) => [...stack, before]));
  };

  const mine = betMap(myBets);
  const mineChips = betChipMap(myBets);
  const othersChips = new Map<string, ChipCount[]>();
  const othersMap = new Map<string, number>();
  for (const player of others) {
    betMap(player.bets, othersMap);
    betChipMap(player.bets, othersChips);
  }

  const readyCount = table?.players.filter((player) => player.ready).length;
  const actionLabel = !betting
    ? phase === "spinning"
      ? "Rien ne va plus"
      : "Les jeux sont faits"
    : ready
      ? "Prêt · annuler"
      : `Je suis prêt · ${credits(total)} cr.`;
  const actionSubline = !betting ? (
    phase === "spinning" ? (
      "La bille tourne…"
    ) : (
      <>
        Prochaine manche dans <CountdownText deadline={table?.deadline} />
      </>
    )
  ) : table?.deadline ? (
    <>
      Lancement dans <CountdownText deadline={table.deadline} />
      {` · ${readyCount}/${table.players.length} prêt${readyCount === 1 ? "" : "s"}`}
    </>
  ) : total > balance ? (
    "Solde insuffisant pour ces mises"
  ) : !game.connected ? (
    "Connexion au serveur…"
  ) : total ? (
    "La bille part quand tout le monde est prêt"
  ) : (
    "Posez vos jetons sur le tapis"
  );

  return (
    <main className="roulette-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            LE CLUB <span>/</span> JEUX DE TABLE
          </div>
          <h1>
            Roulette <span>Européenne</span>
            <span className="live-tag">
              <i />
              LIVE
            </span>
          </h1>
        </div>
      </div>

      <section
        className="table-panel roulette-panel"
        aria-label="Table de roulette"
      >
        <div className="table-toolbar">
          <div className="table-identity">
            <span
              className={`connection-dot ${game.connected ? "online" : ""}`}
            />
            <b>TABLE PUBLIQUE</b>
            <span className="table-separator">/</span>
            <span>
              {credits(ROULETTE_MIN_CHIP)} – {credits(ROULETTE_MAX_PER_SPOT)}{" "}
              crédits par case
            </span>
          </div>
          <div className="table-toolbar-actions">
            <ol
              className="roulette-history"
              aria-label="Derniers numéros sortis"
            >
              {(table?.history ?? []).slice(0, 10).map((number, index) => (
                <li
                  key={`${table?.round}-${index}`}
                  className={numberTone(number)}
                >
                  {number}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="roulette-stage" ref={stageRef}>
          <div className="roulette-felt">
            <div className="felt-texture" />
            <div className="table-inner-line" />
          </div>
          <div className="roulette-wheel-zone">
            <RouletteWheel
              result={table?.number ?? null}
              spinKey={round}
              spinning={phase === "spinning"}
              showResult={phase === "settled"}
            />
            <div
              className={`roulette-outcome ${
                phase === "spinning"
                  ? "is-spinning"
                  : phase === "settled" && myResult
                    ? myResult.net > 0
                      ? "positive"
                      : myResult.net < 0
                        ? "negative"
                        : "neutral"
                    : ""
              }`}
              role="status"
              aria-live="polite"
            >
              {phase === "spinning" ? (
                <>
                  <small>RIEN NE VA PLUS</small>
                  <strong>La bille tourne…</strong>
                </>
              ) : phase === "settled" && table?.number != null ? (
                <>
                  <small>
                    LE {table.number} {colorName(table.number)} EST SORTI
                  </small>
                  <strong>
                    {!myResult
                      ? "Vous n’avez pas misé"
                      : myResult.net > 0
                        ? "Gains versés"
                        : myResult.net < 0
                          ? "La banque ramasse"
                          : "Mise remboursée"}
                  </strong>
                </>
              ) : table?.deadline ? (
                <>
                  <small>DERNIÈRES MISES</small>
                  <strong>
                    Lancement dans <CountdownText deadline={table.deadline} />
                  </strong>
                </>
              ) : (
                <>
                  <small>FAITES VOS JEUX</small>
                  <strong>Posez vos jetons</strong>
                </>
              )}
            </div>
            <ul className="roulette-players" aria-label="Joueurs à table">
              {(table?.players ?? []).map((player) => {
                const playerResult = table?.results.find(
                  (entry) => entry.playerId === player.id,
                );
                const staked = rouletteTotal(player.bets);
                return (
                  <li
                    key={player.id}
                    className={`${player.id === me?.id ? "is-me" : "is-other"} ${player.ready ? "is-ready" : ""} ${player.connected ? "" : "is-away"}`}
                  >
                    <PlayerMenu id={player.id} name={player.name}>
                      <button
                        type="button"
                        className="roulette-player-trigger"
                        aria-label={`Actions pour ${player.name}`}
                      >
                        <PlayerAvatar
                          id={player.id}
                          name={player.name}
                          size="sm"
                        />
                        <span className="roulette-player-name">
                          {player.id === me?.id ? "Vous" : player.name}
                        </span>
                      </button>
                    </PlayerMenu>
                    {phase === "settled" && playerResult ? (
                      <b
                        className={
                          playerResult.net > 0
                            ? "positive"
                            : playerResult.net < 0
                              ? "negative"
                              : ""
                        }
                      >
                        {playerResult.net > 0 ? "+" : ""}
                        {credits(playerResult.net)}
                      </b>
                    ) : (
                      <b>{staked ? `${credits(staked)} cr.` : "—"}</b>
                    )}
                    {player.ready && betting && (
                      <Check
                        size={12}
                        className="roulette-player-ready"
                        aria-label="Prêt"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="roulette-board-zone">
            <div className="roulette-pot-zone">
              <span className="roulette-pot-anchor" aria-hidden="true" />
              {phase === "settled" && myResult && (
                <div
                  className={`table-round-result roulette-round-result ${myResult.net > 0 ? "positive" : myResult.net < 0 ? "negative" : "neutral"}`}
                  role="status"
                  aria-label={`Résultat de la manche : ${myResult.net < 0 ? "perte de " : "retour de "}${credits(myResult.net < 0 ? -myResult.net : myResult.payout)} crédits`}
                >
                  <span className="table-round-result-kicker">
                    {myResult.net > 0
                      ? "RETOUR TOTAL"
                      : myResult.net === 0
                        ? "MISE REMBOURSÉE"
                        : "MANCHE PERDUE"}
                  </span>
                  <strong>
                    {myResult.net < 0 ? "−" : "+"}
                    {credits(
                      myResult.net < 0 ? -myResult.net : myResult.payout,
                    )}
                    <small>cr.</small>
                  </strong>
                  <span className="table-round-result-countdown">
                    <small>PROCHAINE MANCHE</small>
                    <CountdownText deadline={table?.deadline} />
                  </span>
                </div>
              )}
            </div>
            <RouletteBoard
              mine={mine}
              mineChips={mineChips}
              others={othersMap}
              othersChips={othersChips}
              chip={chip}
              canBet={canBet}
              result={result}
              phase={phase}
              onPlace={place}
              onRemove={remove}
            />
          </div>
          <RouletteFx table={table} stageRef={stageRef} />
        </div>
      </section>

      <GameControlsBar ariaLabel="Mises de la roulette">
        <GameControlGroup label="Jeton">
          <div className="chip-picker">
            {CASINO_CHIP_DENOMINATIONS.map((amount) => (
              <Chip
                key={amount}
                amount={amount}
                selected={chip === amount}
                disabled={!betting || ready || amount > balance - total}
                onClick={setChip}
              />
            ))}
            <span className="rack-divider" />
            <button
              type="button"
              className="icon-button repeat-bet"
              disabled={
                !canBet ||
                !me?.previousTotal ||
                total > 0 ||
                me.previousTotal > balance
              }
              onClick={repeat}
              title={
                me?.previousTotal
                  ? `Répéter la mise précédente (${credits(me.previousTotal)} crédits)`
                  : "Aucune mise précédente"
              }
              aria-label="Répéter la mise précédente"
            >
              <Repeat2 size={16} />
              <span>Répéter</span>
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={!canBet || !undo.length}
              onClick={undoLast}
              title="Annuler le dernier jeton"
              aria-label="Annuler le dernier jeton"
            >
              <RotateCcw size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={!canBet || !myBets.length}
              onClick={() => void send([])}
              title="Retirer toutes vos mises"
              aria-label="Retirer toutes vos mises"
            >
              <X size={17} />
            </button>
          </div>
        </GameControlGroup>
        <GameControlGroup
          label={
            <>
              Mise totale{" "}
              <b className="game-bet-amount">{credits(total)} cr.</b>
            </>
          }
        >
          <span className="roulette-bet-summary">
            {myBets.length
              ? `${myBets.length} mise${myBets.length > 1 ? "s" : ""} sur le tapis`
              : "Aucun jeton posé"}
          </span>
        </GameControlGroup>
        <GameActionButton
          variant="start"
          busy={game.pending}
          disabled={
            !betting ||
            !me ||
            !game.connected ||
            (!ready && (total < ROULETTE_MIN_CHIP || total > balance))
          }
          icon={ready ? <Check size={18} /> : <CircleDot size={18} />}
          label={actionLabel}
          subline={actionSubline}
          onClick={() =>
            void game.rouletteCommand({ type: "ready", ready: !ready })
          }
        />
        <button
          type="button"
          className="icon-button repeat-bet mobile-repeat-bet"
          disabled={
            !canBet ||
            !me?.previousTotal ||
            total > 0 ||
            me.previousTotal > balance
          }
          onClick={repeat}
          title={
            me?.previousTotal
              ? `Répéter la mise précédente (${credits(me.previousTotal)} crédits)`
              : "Aucune mise précédente"
          }
          aria-label="Répéter la mise précédente"
        >
          <Repeat2 size={16} />
          <span>Répéter</span>
        </button>
      </GameControlsBar>
      {game.error && (
        <p className="mines-global-error" role="alert">
          {game.error}
        </p>
      )}
    </main>
  );
}

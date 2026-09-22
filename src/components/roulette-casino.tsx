"use client";

import { Check, CircleDot, Repeat2, RotateCcw, Volume2, X } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { playCasinoSound, preloadCasinoSounds } from "@/lib/casino-audio";
import { CASINO_CHIP_DENOMINATIONS } from "@/lib/chips";
import {
  EUROPEAN_WHEEL_ORDER,
  ROULETTE_MAX_BETS,
  ROULETTE_MAX_TOTAL,
  ROULETTE_MIN_CHIP,
  ROULETTE_PAYOUTS,
  rouletteBetId,
  rouletteBetLabel,
  rouletteBetWins,
  rouletteNumberColor,
  rouletteTotal,
  type RouletteBet,
  type RouletteBetKind,
} from "@/lib/roulette";
import { credits } from "@/lib/rules";
import type { RouletteTableState } from "@/lib/types";
import { useGame } from "@/lib/use-game";
import {
  SettlementChipAnimation,
  TableChipStack,
  type CasinoView,
} from "./casino";
import { Chip } from "./chip";
import { ROULETTE_FX, RouletteFx } from "./roulette-fx";
import { CountdownText } from "./countdown";
import {
  GameActionButton,
  GameControlGroup,
  GameControlsBar,
} from "./game-controls";
import { CasinoRail, ClubHeader, getClubBalance } from "./poker-casino";

type Game = ReturnType<typeof useGame>;

const SECTOR = 360 / EUROPEAN_WHEEL_ORDER.length;
const WHEEL_ORDER: readonly number[] = EUROPEAN_WHEEL_ORDER;

function numberTone(number: number) {
  return `tone-${rouletteNumberColor(number)}`;
}

function colorName(number: number) {
  const color = rouletteNumberColor(number);
  return color === "green" ? "VERT" : color === "red" ? "ROUGE" : "NOIR";
}

/* ── Wheel ───────────────────────────────────────────────────────────── */

export const RouletteWheel = memo(function RouletteWheel({
  result,
  spinKey,
  spinning,
  showResult,
  poster = false,
}: {
  result: number | null;
  spinKey: number;
  spinning: boolean;
  showResult: boolean;
  poster?: boolean;
}) {
  const [rotation, setRotation] = useState(() =>
    result === null ? 0 : -WHEEL_ORDER.indexOf(result) * SECTOR,
  );
  const [ballRotation, setBallRotation] = useState(0);
  const lastKey = useRef(spinKey);

  useEffect(() => {
    if (!spinning || result === null || lastKey.current === spinKey) return;
    lastKey.current = spinKey;
    const index = WHEEL_ORDER.indexOf(result);
    // The pocket ends under the pointer whatever the previous resting angle.
    setRotation((current) => {
      const target = -index * SECTOR;
      const delta = (((target - current) % 360) + 360) % 360;
      return current + 5 * 360 + delta;
    });
    setBallRotation((current) => current - 7 * 360);
  }, [result, spinKey, spinning]);

  return (
    <div
      className={`roulette-wheel-frame ${poster ? "is-poster" : ""} ${spinning ? "is-spinning" : ""}`}
      aria-hidden="true"
    >
      <span className="roulette-wheel-pointer" />
      <div
        className="roulette-wheel"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {!poster &&
          EUROPEAN_WHEEL_ORDER.map((number, index) => (
            <span
              key={number}
              className="roulette-wheel-slot"
              style={{ transform: `rotate(${index * SECTOR}deg)` }}
            >
              <b>{number}</b>
            </span>
          ))}
        <span className="roulette-wheel-cone" />
        <span className="roulette-wheel-turret" />
      </div>
      {!poster && (
        <div
          className="roulette-ball-orbit"
          style={{ transform: `rotate(${ballRotation}deg)` }}
        >
          <span className="roulette-ball" key={spinKey} />
        </div>
      )}
      {showResult && result !== null && (
        <span
          className={`roulette-wheel-result ${numberTone(result)}`}
          key={spinKey}
        >
          {result}
        </span>
      )}
    </div>
  );
});

export function RoulettePosterArt() {
  return (
    <div className="roulette-poster-art">
      <RouletteWheel
        result={null}
        spinKey={0}
        spinning={false}
        showResult={false}
        poster
      />
      <span className="roulette-poster-ball" />
    </div>
  );
}

/* ── Layout ──────────────────────────────────────────────────────────── */

type Target = { kind: RouletteBetKind; selection: string };

type BoardProps = {
  mine: Map<string, number>;
  /** Chips of the other players, drawn translucent in another colour. */
  others: Map<string, number>;
  chip: number;
  canBet: boolean;
  result: number | null;
  phase: RouletteTableState["phase"];
  /** Spot under the pointer, set by the board itself. */
  previewId?: string | null;
  onPlace: (kind: RouletteBetKind, selection: string) => void;
  onRemove: (kind: RouletteBetKind, selection: string) => void;
};

/** Row from the top of the layout: 3, 6, 9… sit on the first row. */
const rowOf = (number: number) => 2 - ((number - 1) % 3);
const columnOf = (number: number) => Math.ceil(number / 3);
const NUMBERS = Array.from({ length: 36 }, (_, index) => index + 1);
const EDGE = 0.26;
const OUTSIDE = [
  ["half", "low", "1 – 18", ""],
  ["parity", "even", "Pair", ""],
  ["color", "red", "", "tone-red"],
  ["color", "black", "", "tone-black"],
  ["parity", "odd", "Impair", ""],
  ["half", "high", "19 – 36", ""],
] as const;

/**
 * Aiming near the edge of a number plays a split with its neighbour, near a
 * corner the four numbers around it, as on online roulette tables.
 */
export function targetAt(number: number, x: number, y: number): Target {
  const column = columnOf(number);
  const row = rowOf(number);
  const dx = x < EDGE ? -1 : x > 1 - EDGE ? 1 : 0;
  const dy = y < EDGE ? -1 : y > 1 - EDGE ? 1 : 0;
  const side =
    dx && column + dx >= 1 && column + dx <= 12 ? number + dx * 3 : null;
  // Up the layout is number + 1 (3 sits above 2), down is number - 1.
  const vertical = dy && row + dy >= 0 && row + dy <= 2 ? number - dy : null;
  const join = (numbers: number[]) =>
    [...numbers].sort((a, b) => a - b).join("-");
  if (side !== null && vertical !== null)
    return {
      kind: "corner",
      selection: join([number, side, vertical, side - dy]),
    };
  if (side !== null) return { kind: "split", selection: join([number, side]) };
  if (vertical !== null)
    return { kind: "split", selection: join([number, vertical]) };
  return { kind: "straight", selection: String(number) };
}

function pointerTarget(
  number: number,
  event: { clientX: number; clientY: number; currentTarget: Element },
) {
  const box = event.currentTarget.getBoundingClientRect();
  return targetAt(
    number,
    (event.clientX - box.left) / box.width,
    (event.clientY - box.top) / box.height,
  );
}

/** Where the chips of a split or corner sit, on the lines between numbers. */
function anchorOf({ kind, selection }: Target) {
  const numbers = selection.split("-").map(Number);
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    left: `${((average(numbers.map(columnOf)) - 0.5) * 100) / 12}%`,
    top: `${((average(numbers.map(rowOf)) + 0.5) * 100) / 3}%`,
    shape: kind === "corner" ? "is-corner" : "is-split",
  };
}

function Chips({ id, board }: { id: string; board: BoardProps }) {
  const amount = board.mine.get(id) ?? 0;
  const others = board.others.get(id) ?? 0;
  if (!amount && !others) return null;
  // Once the ball is launched every chip of a spot joins one pile. At the
  // result the losing piles are taken over by RouletteFx, while the winnings
  // merge into the winning piles as on the Blackjack table, and stay there.
  if (board.phase !== "betting") {
    const [kind, selection] = id.split(":") as [RouletteBetKind, string];
    if (board.result !== null) {
      if (!rouletteBetWins({ kind, selection }, board.result)) return null;
      const stake = amount + others;
      const gain = stake * ROULETTE_PAYOUTS[kind];
      return (
        <>
          <SettlementChipAnimation
            stake={stake}
            payout={stake + gain}
            maximum={ROULETTE_MAX_TOTAL / 2}
          />
          <span
            className={`roulette-win-tag ${kind === "straight" ? "" : "is-below"}`}
          >
            +{credits(gain)}
          </span>
        </>
      );
    }
    return (
      <TableChipStack
        amount={amount + others}
        maximum={ROULETTE_MAX_TOTAL / 2}
        className="roulette-chip"
      />
    );
  }
  // Other players' chips stay discreet, and fade further under my own chips
  // or under the spot I am aiming at.
  const faint = amount > 0 || board.previewId === id;
  return (
    <>
      {others > 0 && (
        <TableChipStack
          amount={others}
          maximum={ROULETTE_MAX_TOTAL / 2}
          className={`roulette-chip roulette-chip-other ${amount ? "is-behind" : ""} ${faint ? "is-faint" : ""}`}
        />
      )}
      {amount > 0 && (
        <TableChipStack
          amount={amount}
          maximum={ROULETTE_MAX_TOTAL / 2}
          className="roulette-chip"
        />
      )}
    </>
  );
}

function spotLabel(target: Target, board: BoardProps) {
  const id = rouletteBetId(target);
  const amount = board.mine.get(id) ?? 0;
  const others = board.others.get(id) ?? 0;
  return `${rouletteBetLabel(target)} · paie ${ROULETTE_PAYOUTS[target.kind]} pour 1${amount ? ` · ${amount} crédits misés` : ""}${others ? ` · ${others} crédits des autres joueurs` : ""}`;
}

/** Every winning spot lights up once the number is out, chips or not. */
function outcomeClass(target: Target, result: number | null) {
  if (result === null) return "";
  return rouletteBetWins(target, result) ? "is-won" : "is-lost";
}

function RouletteBoard(props: BoardProps) {
  const [preview, setPreview] = useState<Target | null>(null);
  const board: BoardProps = {
    ...props,
    previewId: preview && props.canBet ? rouletteBetId(preview) : null,
  };
  const covered = (number: number) =>
    !!preview && board.canBet && rouletteBetWins(preview, number);
  const hover = (target: Target | null) =>
    setPreview((current) =>
      current?.kind === target?.kind && current?.selection === target?.selection
        ? current
        : target,
    );
  const spotProps = (target: Target) => ({
    type: "button" as const,
    "data-bet": rouletteBetId(target),
    disabled: !board.canBet,
    "aria-label": spotLabel(target, board),
    title: `${rouletteBetLabel(target)} · ${ROULETTE_PAYOUTS[target.kind]} pour 1`,
    onPointerEnter: () => hover(target),
    onClick: () => board.onPlace(target.kind, target.selection),
    onContextMenu: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      board.onRemove(target.kind, target.selection);
    },
  });
  // Splits and corners carrying chips, mine or the other players'.
  const inside = [
    ...new Set([...board.mine.keys(), ...board.others.keys()]),
  ].filter((id) => id.startsWith("split:") || id.startsWith("corner:"));
  const previewAnchor =
    preview && preview.kind !== "straight" && board.canBet
      ? anchorOf(preview)
      : null;

  return (
    <div className="roulette-layout-scroll">
      <div
        className={`roulette-layout ${board.result !== null ? "has-result" : ""}`}
        style={
          {
            "--roulette-winnings-delay": `${ROULETTE_FX.winnings}ms`,
          } as CSSProperties
        }
        data-testid="roulette-board"
        onPointerLeave={() => hover(null)}
      >
        <button
          {...spotProps({ kind: "straight", selection: "0" })}
          className={`roulette-spot roulette-zero ${outcomeClass({ kind: "straight", selection: "0" }, board.result)} ${covered(0) ? "is-preview" : ""}`}
        >
          <span className="roulette-number">0</span>
          <Chips id="straight:0" board={board} />
        </button>
        <div className="roulette-numbers">
          {NUMBERS.map((number) => {
            const straight: Target = {
              kind: "straight",
              selection: String(number),
            };
            return (
              <button
                key={number}
                type="button"
                data-bet={rouletteBetId(straight)}
                disabled={!board.canBet}
                aria-label={spotLabel(straight, board)}
                className={`roulette-spot roulette-cell ${numberTone(number)} ${outcomeClass(straight, board.result)} ${covered(number) ? "is-preview" : ""}`}
                style={{
                  gridColumn: columnOf(number),
                  gridRow: rowOf(number) + 1,
                }}
                onPointerMove={(event) => hover(pointerTarget(number, event))}
                onClick={(event) => {
                  // Keyboard activation has no pointer position: plain number.
                  const target =
                    event.detail === 0
                      ? straight
                      : pointerTarget(number, event);
                  board.onPlace(target.kind, target.selection);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const target = pointerTarget(number, event);
                  board.onRemove(target.kind, target.selection);
                }}
              >
                <span className="roulette-number">{number}</span>
                <Chips id={rouletteBetId(straight)} board={board} />
              </button>
            );
          })}
          {inside.map((id) => {
            const [kind, selection] = id.split(":") as [
              RouletteBetKind,
              string,
            ];
            const anchor = anchorOf({ kind, selection });
            return (
              <span
                key={id}
                data-bet={id}
                className={`roulette-anchor ${anchor.shape} ${outcomeClass({ kind, selection }, board.result)}`}
                style={{ left: anchor.left, top: anchor.top }}
              >
                <Chips id={id} board={board} />
              </span>
            );
          })}
          {previewAnchor && (
            <span
              className={`roulette-anchor roulette-anchor-preview ${previewAnchor.shape}`}
              style={{ left: previewAnchor.left, top: previewAnchor.top }}
            >
              <span className="roulette-preview-label">
                {rouletteBetLabel(preview!)} · +{board.chip}
              </span>
            </span>
          )}
        </div>
        {[3, 2, 1].map((column, index) => {
          const target: Target = { kind: "column", selection: String(column) };
          return (
            <button
              key={column}
              {...spotProps(target)}
              className={`roulette-spot roulette-outside roulette-column ${outcomeClass(target, board.result)}`}
              style={{ gridColumn: 14, gridRow: index + 1 }}
            >
              <span>2:1</span>
              <Chips id={rouletteBetId(target)} board={board} />
            </button>
          );
        })}
        {[1, 2, 3].map((dozen) => {
          const target: Target = { kind: "dozen", selection: String(dozen) };
          return (
            <button
              key={dozen}
              {...spotProps(target)}
              className={`roulette-spot roulette-outside ${outcomeClass(target, board.result)}`}
              style={{
                gridColumn: `${2 + (dozen - 1) * 4} / span 4`,
                gridRow: 4,
              }}
            >
              <span>
                {dozen}
                <sup>{dozen === 1 ? "re" : "e"}</sup> douzaine
              </span>
              <Chips id={rouletteBetId(target)} board={board} />
            </button>
          );
        })}
        {OUTSIDE.map(([kind, selection, text, tone], index) => {
          const target: Target = { kind, selection };
          return (
            <button
              key={`${kind}:${selection}`}
              {...spotProps(target)}
              className={`roulette-spot roulette-outside ${tone} ${outcomeClass(target, board.result)}`}
              style={{ gridColumn: `${2 + index * 2} / span 2`, gridRow: 5 }}
            >
              {text ? (
                <span>{text}</span>
              ) : (
                <span className={`roulette-diamond ${tone}`} />
              )}
              <Chips id={rouletteBetId(target)} board={board} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function betMap(bets: RouletteBet[], into = new Map<string, number>()) {
  for (const bet of bets) {
    const id = rouletteBetId(bet);
    into.set(id, (into.get(id) ?? 0) + bet.amount);
  }
  return into;
}

/* ── Page ────────────────────────────────────────────────────────────── */

export function RouletteCasino({
  game,
  onNavigate,
}: {
  game: Game;
  onNavigate: (view: CasinoView) => void;
}) {
  const table = game.rouletteState;
  const balance = getClubBalance(game);
  const { enterRoulette, leaveRoulette } = game;
  const [chip, setChip] = useState<number>(CASINO_CHIP_DENOMINATIONS[1]);
  const [undo, setUndo] = useState<RouletteBet[][]>([]);
  const [sound, setSound] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
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
    if (phase === "spinning") play("chips");
    if (phase === "settled") {
      play("knock");
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
    if (total + chip > ROULETTE_MAX_TOTAL) {
      game.setError(
        `La mise totale est limitée à ${ROULETTE_MAX_TOTAL} crédits.`,
      );
      return;
    }
    if (total + chip > balance) {
      game.setError("Votre solde est insuffisant pour ce jeton.");
      return;
    }
    const id = rouletteBetId({ kind, selection });
    const existing = myBets.some((bet) => rouletteBetId(bet) === id);
    if (!existing && myBets.length >= ROULETTE_MAX_BETS) return;
    play("chips");
    void send(
      existing
        ? myBets.map((bet) =>
            rouletteBetId(bet) === id
              ? { ...bet, amount: bet.amount + chip }
              : bet,
          )
        : [...myBets, { kind, selection, amount: chip }],
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
  const othersMap = new Map<string, number>();
  for (const player of others) betMap(player.bets, othersMap);

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
    <div className="casino-shell roulette-shell">
      <CasinoRail active="roulette" onNavigate={onNavigate} />
      <div className="workspace">
        <ClubHeader balance={balance} name={game.profile?.name ?? ""} />
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
                <b>TABLE {table?.id ?? "…"}</b>
                <span className="table-separator">/</span>
                <span>
                  {ROULETTE_MIN_CHIP} – {ROULETTE_MAX_TOTAL} crédits
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
                <button
                  type="button"
                  className={`poker-sound ${sound ? "active" : ""}`}
                  aria-label={sound ? "Couper les sons" : "Activer les sons"}
                  aria-pressed={sound}
                  onClick={() => {
                    const context = (audioRef.current ??= new AudioContext());
                    void context.resume();
                    preloadCasinoSounds(context);
                    setSound(!sound);
                  }}
                >
                  <Volume2 size={15} />
                </button>
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
                        Lancement dans{" "}
                        <CountdownText deadline={table.deadline} />
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
                        <span className="roulette-player-avatar">
                          {player.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="roulette-player-name">
                          {player.id === me?.id ? "Vous" : player.name}
                        </span>
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
                  others={othersMap}
                  chip={chip}
                  canBet={canBet}
                  result={result}
                  phase={phase}
                  onPlace={place}
                  onRemove={remove}
                />
                <p className="roulette-board-hint">
                  Cliquez pour poser le jeton · clic droit pour retirer une mise
                  · les jointures jouent chevaux et carrés · les mises des
                  autres joueurs apparaissent en transparence
                </p>
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
                    disabled={!betting || ready}
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
          </GameControlsBar>
          {game.error && (
            <p className="mines-global-error" role="alert">
              {game.error}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

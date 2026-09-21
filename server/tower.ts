import { randomInt, randomUUID } from "node:crypto";
import type { Player } from "./engine";
import type {
  TowerCell,
  TowerClientState,
  TowerCommand,
  TowerDifficulty,
  TowerFeedItem,
  TowerGhost,
  TowerHistoryItem,
  TowerPublicState,
  TowerRun,
  TowerStatus,
} from "../src/lib/types";
import {
  isTowerDifficulty,
  TOWER_BET_STEP,
  TOWER_DIFFICULTIES,
  TOWER_FLOORS,
  TOWER_JACKPOT_RATE,
  TOWER_JACKPOT_SEED,
  TOWER_LUCKY_ODDS,
  TOWER_MAX_BET,
  TOWER_MIN_BET,
  towerLuckyPayout,
  towerPayout,
} from "../src/lib/tower";

/** Finished climbs stay visible to other players while they fall or shine. */
export const TOWER_GHOST_LINGER_MS = 4_500;
/** Accrued winnings are cashed out for a player who stays away this long. */
export const TOWER_ABANDON_MS = 10 * 60_000;
const PICK_INTERVAL_MS = 250;
const MAX_GHOSTS = 12;
const FEED_SIZE = 12;
const HISTORY_SIZE = 10;

type InternalRun = TowerRun & {
  player: Player;
  /** Trap column per floor, -1 for a Lucky Tower. Never sent before the end. */
  traps: number[];
  lastPickAt: number;
  endedAt: number | null;
  ghostExpired: boolean;
};

export type TowerRandom = (max: number) => number;

export class TowerManager {
  jackpot = TOWER_JACKPOT_SEED;
  private runs = new Map<string, InternalRun>();
  private history = new Map<string, TowerHistoryItem[]>();
  private feed: TowerFeedItem[] = [];

  constructor(
    private send: (playerId: string, state: TowerClientState) => void,
    private broadcast: (state: TowerPublicState) => void,
    private random: TowerRandom = randomInt,
    private luckyOdds = TOWER_LUCKY_ODDS,
    /** Development aid: ordinary climbs without any trap. */
    private noTraps = false,
  ) {}

  publicState(): TowerPublicState {
    return {
      jackpot: Math.floor(this.jackpot),
      ghosts: this.ghosts(),
      feed: this.feed.map((item) => ({ ...item })),
    };
  }

  state(player: Player): TowerClientState {
    const run = this.runs.get(player.id);
    return {
      ...this.publicState(),
      balance: player.balance,
      run: run ? this.publicRun(run) : null,
      history: (this.history.get(player.id) ?? []).map((item) => ({
        ...item,
      })),
    };
  }

  connect(player: Player) {
    const run = this.runs.get(player.id);
    if (run) run.player = player;
    this.send(player.id, this.state(player));
  }

  command(player: Player, command: TowerCommand, now = Date.now()) {
    if (command?.type === "start")
      this.start(player, command.difficulty, command.bet, now);
    else if (command?.type === "pick") this.pick(player, command.column, now);
    else if (command?.type === "cashout") this.cashout(player, now);
    else throw new Error("Action inconnue.");
    this.send(player.id, this.state(player));
    this.broadcast(this.publicState());
  }

  tick(now: number) {
    let changed = false;
    for (const [playerId, run] of this.runs) {
      if (
        run.status === "playing" &&
        !run.player.connected &&
        now - run.player.lastSeen > TOWER_ABANDON_MS
      ) {
        // Nothing is at risk before the first floor: the wager is returned.
        if (run.lucky) this.climbLuckyToTop(run, now);
        else this.finish(run, "cashed", now, run.floor ? undefined : run.bet);
        changed = true;
      }
      if (
        run.endedAt !== null &&
        !run.ghostExpired &&
        now - run.endedAt > TOWER_GHOST_LINGER_MS
      ) {
        run.ghostExpired = true;
        changed = true;
      }
      if (
        run.endedAt !== null &&
        !run.player.connected &&
        now - run.player.lastSeen > 24 * 60 * 60_000
      ) {
        this.runs.delete(playerId);
        this.history.delete(playerId);
      }
    }
    if (changed) this.broadcast(this.publicState());
  }

  /** Test and debug helper: the hidden trap columns of a player's climb. */
  trapsOf(playerId: string) {
    return this.runs.get(playerId)?.traps.slice();
  }

  private start(
    player: Player,
    difficulty: TowerDifficulty,
    bet: number,
    now: number,
  ) {
    if (!isTowerDifficulty(difficulty))
      throw new Error("Choisissez une difficulté.");
    if (
      typeof bet !== "number" ||
      !Number.isInteger(bet) ||
      bet < TOWER_MIN_BET ||
      bet > TOWER_MAX_BET ||
      bet % TOWER_BET_STEP
    )
      throw new Error(
        `La mise doit être comprise entre ${TOWER_MIN_BET} et ${TOWER_MAX_BET} crédits, par pas de ${TOWER_BET_STEP}.`,
      );
    if (this.runs.get(player.id)?.status === "playing")
      throw new Error("Terminez d’abord votre ascension en cours.");
    if (player.balance < bet) throw new Error("Votre solde est insuffisant.");

    player.balance -= bet;
    this.jackpot =
      Math.round((this.jackpot + bet * TOWER_JACKPOT_RATE) * 100) / 100;
    const cols = TOWER_DIFFICULTIES[difficulty].cols;
    const lucky = this.random(this.luckyOdds) === 0;
    this.runs.set(player.id, {
      id: randomUUID(),
      difficulty,
      cols,
      bet,
      floor: 0,
      status: "playing",
      lucky,
      rows: Array.from({ length: TOWER_FLOORS }, () => ({
        picked: null,
        cells: null,
      })),
      payout: 0,
      startedAt: now,
      player,
      traps: Array.from({ length: TOWER_FLOORS }, () =>
        lucky || this.noTraps ? -1 : this.random(cols),
      ),
      lastPickAt: 0,
      endedAt: null,
      ghostExpired: false,
    });
  }

  private activeRun(player: Player) {
    const run = this.runs.get(player.id);
    if (!run || run.status !== "playing")
      throw new Error("Aucune ascension en cours.");
    return run;
  }

  private pick(player: Player, column: number, now: number) {
    const run = this.activeRun(player);
    if (
      typeof column !== "number" ||
      !Number.isInteger(column) ||
      column < 0 ||
      column >= run.cols
    )
      throw new Error("Cette carte n’existe pas.");
    if (now - run.lastPickAt < PICK_INTERVAL_MS)
      throw new Error("Un instant… la carte se retourne.");
    run.lastPickAt = now;
    const row = run.rows[run.floor];
    row.picked = column;
    row.cells = this.cells(run, run.floor);
    if (run.traps[run.floor] === column) {
      this.finish(run, "lost", now);
      return;
    }
    run.floor++;
    if (run.floor === TOWER_FLOORS) this.finish(run, "topped", now);
  }

  private cashout(player: Player, now: number) {
    const run = this.activeRun(player);
    if (run.lucky)
      throw new Error("La Lucky Tower se termine au sommet : continuez !");
    if (run.floor < 1)
      throw new Error("Franchissez au moins un étage avant d’encaisser.");
    this.finish(run, "cashed", now);
  }

  private climbLuckyToTop(run: InternalRun, now: number) {
    for (let floor = run.floor; floor < TOWER_FLOORS; floor++)
      run.rows[floor].cells = this.cells(run, floor);
    run.floor = TOWER_FLOORS;
    this.finish(run, "topped", now);
  }

  private cells(run: InternalRun, floor: number): TowerCell[] {
    return Array.from({ length: run.cols }, (_, column) =>
      run.lucky ? "gold" : run.traps[floor] === column ? "trap" : "safe",
    );
  }

  private finish(
    run: InternalRun,
    status: Exclude<TowerStatus, "playing">,
    now: number,
    payoutOverride?: number,
  ) {
    let payout = 0;
    if (payoutOverride !== undefined) payout = payoutOverride;
    else if (status !== "lost" && run.lucky) {
      payout = towerLuckyPayout(run.bet, this.jackpot);
      this.jackpot = Math.max(TOWER_JACKPOT_SEED, this.jackpot - payout);
    } else if (status !== "lost")
      payout = towerPayout(run.bet, run.difficulty, run.floor);

    run.status = status;
    run.payout = payout;
    run.endedAt = now;
    run.player.balance += payout;
    for (let floor = 0; floor < TOWER_FLOORS; floor++)
      run.rows[floor].cells ??= this.cells(run, floor);

    const history = this.history.get(run.player.id) ?? [];
    history.unshift({
      id: run.id,
      difficulty: run.difficulty,
      floor: run.floor,
      status,
      lucky: run.lucky,
      bet: run.bet,
      payout,
      timestamp: now,
    });
    this.history.set(run.player.id, history.slice(0, HISTORY_SIZE));
    this.feed.unshift({
      id: run.id,
      name: run.player.name,
      status,
      difficulty: run.difficulty,
      floor: run.floor,
      lucky: run.lucky,
      amount: payout,
      timestamp: now,
    });
    this.feed = this.feed.slice(0, FEED_SIZE);
  }

  private publicRun(run: InternalRun): TowerRun {
    return {
      id: run.id,
      difficulty: run.difficulty,
      cols: run.cols,
      bet: run.bet,
      floor: run.floor,
      status: run.status,
      lucky: run.lucky,
      rows: run.rows.map((row) => ({
        picked: row.picked,
        cells: row.cells ? [...row.cells] : null,
      })),
      payout: run.payout,
      startedAt: run.startedAt,
    };
  }

  private ghosts(): TowerGhost[] {
    return (
      [...this.runs.values()]
        // Absent climbers are hidden until they come back.
        .filter((run) =>
          run.status === "playing" ? run.player.connected : !run.ghostExpired,
        )
        .sort(
          (a, b) =>
            Math.max(b.lastPickAt, b.startedAt) -
            Math.max(a.lastPickAt, a.startedAt),
        )
        .slice(0, MAX_GHOSTS)
        .map((run) => ({
          id: run.id,
          playerId: run.player.id,
          name: run.player.name,
          difficulty: run.difficulty,
          cols: run.cols,
          floor: run.floor,
          status: run.status,
          lucky: run.lucky,
          payout: run.payout,
        }))
    );
  }
}

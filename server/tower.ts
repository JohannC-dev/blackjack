import { randomInt, randomUUID } from "node:crypto";
import { gameEffect } from "./effect";
import type { Player } from "./engine";
import { inMemoryGameWallet, type GameWallet } from "./game-wallet";
import { makeRoomRuntime, type Room } from "./rooms";
import type {
  TowerCell,
  TowerClientState,
  TowerCommand,
  TowerDifficulty,
  TowerFeedItem,
  TowerGhost,
  TowerPublicState,
  TowerRun,
  TowerStatus,
} from "../src/lib/types";
import {
  isTowerDifficulty,
  TOWER_BET_STEP,
  TOWER_DIFFICULTIES,
  TOWER_FLOORS,
  TOWER_GOLD_FIRST_FLOOR,
  TOWER_GOLD_LAST_FLOOR,
  TOWER_LUCKY_SHARE,
  TOWER_MAX_BET,
  TOWER_MIN_BET,
  towerLuckyPayout,
  towerPayout,
} from "../src/lib/tower";

/** Finished climbs stay visible to other players while they fall or shine. */
export const TOWER_GHOST_LINGER_MS = 4_500;
/** A climb left behind by a lost connection is settled after this delay. */
export const TOWER_ABANDON_MS = 10 * 60_000;
/** Climbers sharing a room see each other; public updates stay in the room. */
export const TOWER_ROOM_SIZE = 10;
/**
 * Chance, out of 10,000, that a climb hides a golden card. Tuned so that about
 * one climb in 500 triggers a Lucky Tower whatever the difficulty, for a
 * player picking at random: fewer climbs reach the golden rows when there are
 * fewer cards. Drawn on the server only, like the Spin & Play wheel.
 */
const GOLD_CHANCE: Record<TowerDifficulty, number> = {
  easy: 212,
  normal: 208,
  hard: 224,
  impossible: 341,
};
const PICK_INTERVAL_MS = 250;
const FEED_SIZE = 12;

type InternalRun = TowerRun & {
  player: Player;
  /** Trap column per floor, -1 in test mode. Never sent before the end. */
  traps: number[];
  /** The hidden golden card, never on a trap. Never sent before the end. */
  gold: { floor: number; column: number } | null;
  lastPickAt: number;
  endedAt: number | null;
  /** When the player's last Tower connection dropped, null while present. */
  absentSince: number | null;
  ghostExpired: boolean;
};

export type TowerRandom = (max: number) => number;

export class TowerManager {
  private runs = new Map<string, InternalRun>();
  /** Each player's own Lucky pot, fed by their wagers only. */
  private pots = new Map<string, number>();
  private rooms = makeRoomRuntime("tower");
  private feeds = new Map<string, TowerFeedItem[]>();

  constructor(
    private send: (playerId: string, state: TowerClientState) => void,
    private broadcast: (roomId: string, state: TowerPublicState) => void,
    private random: TowerRandom = randomInt,
    /** Development aid: ordinary climbs without any trap. */
    private noTraps = false,
    private readonly wallet: GameWallet = inMemoryGameWallet,
    private readonly betLimits: { min: number; max: number; step: number } = {
      min: TOWER_MIN_BET,
      max: TOWER_MAX_BET,
      step: TOWER_BET_STEP,
    },
  ) {}

  publicState(roomId: string | undefined): TowerPublicState {
    const room = roomId ? this.rooms.get(roomId) : undefined;
    return {
      ghosts: room ? this.ghosts(room) : [],
      feed:
        (room ? this.feeds.get(room.id) : undefined)?.map((item) => ({
          ...item,
        })) ?? [],
    };
  }

  state(player: Player): TowerClientState {
    const run = this.runs.get(player.id);
    return {
      ...this.publicState(this.rooms.roomOf(player.id)),
      run: run ? this.publicRun(run) : null,
      luckyPot: towerLuckyPayout(this.pots.get(player.id) ?? 0),
    };
  }

  /** Socket.IO channel of a player currently in the Tower, if any. */
  roomIdOf(playerId: string) {
    const roomId = this.rooms.roomOf(playerId);
    return roomId ? this.rooms.channel(roomId) : undefined;
  }

  /** The player opens the Tower: seat them in a room and restore their climb. */
  enter(player: Player) {
    let roomId = this.rooms.roomOf(player.id);
    if (!roomId) {
      const room = this.rooms.enterPublic(
        player.id,
        (candidate) => candidate.members.size < TOWER_ROOM_SIZE,
      );
      roomId = room.id;
    }
    const run = this.runs.get(player.id);
    if (run) {
      run.player = player;
      run.absentSince = null;
    }
    this.send(player.id, this.state(player));
    this.broadcast(this.rooms.channel(roomId), this.publicState(roomId));
    return this.rooms.channel(roomId);
  }

  enterEffect(player: Player) {
    return gameEffect(() => this.enter(player));
  }

  /**
   * The player leaves the Tower. Navigating away settles the climb at once;
   * a lost connection keeps it for TOWER_ABANDON_MS so a reload can resume it.
   */
  leave(player: Player, now = Date.now(), { abandon = true } = {}) {
    const run = this.runs.get(player.id);
    if (run?.status === "playing") {
      if (abandon) this.settleAbandoned(run, now);
      else run.absentSince = now;
    }
    const roomId = this.rooms.roomOf(player.id);
    if (!roomId) return;
    this.rooms.leave(player.id);
    if (this.rooms.deleteEmpty(roomId)) this.feeds.delete(roomId);
    else this.broadcast(this.rooms.channel(roomId), this.publicState(roomId));
    if (run && run.status !== "playing") this.runs.delete(player.id);
  }

  leaveEffect(player: Player, now?: number, options?: { abandon?: boolean }) {
    return gameEffect((clock) =>
      this.leave(player, now ?? clock.now(), options),
    );
  }

  command(player: Player, command: TowerCommand, now = Date.now()) {
    const roomId = this.rooms.roomOf(player.id);
    if (!roomId) throw new Error("Ouvrez la Tower pour jouer.");
    if (command?.type === "start")
      this.start(player, command.difficulty, command.bet, now);
    else if (command?.type === "pick") this.pick(player, command.column, now);
    else if (command?.type === "cashout") this.cashout(player, now);
    else throw new Error("Action inconnue.");
    this.send(player.id, this.state(player));
    this.broadcast(this.rooms.channel(roomId), this.publicState(roomId));
  }

  commandEffect(player: Player, command: TowerCommand, now?: number) {
    return gameEffect((clock) =>
      this.command(player, command, now ?? clock.now()),
    );
  }

  tickEffect(now?: number) {
    return gameEffect((clock) => this.tick(now ?? clock.now()));
  }
  tick(now: number) {
    const changed = new Set<string>();
    for (const [playerId, run] of this.runs) {
      const roomId = this.rooms.roomOf(playerId);
      if (
        run.status === "playing" &&
        run.absentSince !== null &&
        now - run.absentSince > TOWER_ABANDON_MS
      )
        this.settleAbandoned(run, now);
      if (run.endedAt === null) continue;
      if (!roomId) {
        this.runs.delete(playerId);
        continue;
      }
      if (!run.ghostExpired && now - run.endedAt > TOWER_GHOST_LINGER_MS) {
        run.ghostExpired = true;
        changed.add(roomId);
      }
    }
    for (const roomId of changed)
      this.broadcast(this.rooms.channel(roomId), this.publicState(roomId));
  }

  /** Test and debug helper: the hidden trap columns of a player's climb. */
  trapsOf(playerId: string) {
    return this.runs.get(playerId)?.traps.slice();
  }

  /** Drops what is kept for a player whose profile expired. */
  forget(playerId: string) {
    this.pots.delete(playerId);
    this.runs.delete(playerId);
  }

  forgetEffect(playerId: string) {
    return gameEffect(() => this.forget(playerId));
  }

  /** Test and debug helper: the hidden golden card of a player's climb. */
  goldOf(playerId: string) {
    const gold = this.runs.get(playerId)?.gold;
    return gold ? { ...gold } : null;
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
      bet < this.betLimits.min ||
      bet > this.betLimits.max ||
      bet % this.betLimits.step
    )
      throw new Error(
        `La mise doit être comprise entre ${this.betLimits.min} et ${this.betLimits.max} crédits, par pas de ${this.betLimits.step}.`,
      );
    if (this.runs.get(player.id)?.status === "playing")
      throw new Error("Terminez d’abord votre ascension en cours.");
    if (this.wallet.balance(player) < bet)
      throw new Error("Votre solde est insuffisant.");

    const runId = randomUUID();
    this.wallet.debit(player, {
      operationId: `tower:${runId}:wager`,
      game: "tower",
      kind: "wager",
      reason: "start",
      referenceId: runId,
      amount: bet,
      metadata: { difficulty },
    });
    this.pots.set(
      player.id,
      Math.round(
        ((this.pots.get(player.id) ?? 0) + bet * TOWER_LUCKY_SHARE) * 100,
      ) / 100,
    );
    const cols = TOWER_DIFFICULTIES[difficulty].cols;
    const traps = Array.from({ length: TOWER_FLOORS }, () =>
      this.noTraps ? -1 : this.random(cols),
    );
    let gold: InternalRun["gold"] = null;
    if (this.random(10_000) < GOLD_CHANCE[difficulty]) {
      const floor =
        TOWER_GOLD_FIRST_FLOOR -
        1 +
        this.random(TOWER_GOLD_LAST_FLOOR - TOWER_GOLD_FIRST_FLOOR + 1);
      // Any card of the row except the trap.
      const column = this.random(cols - 1);
      gold = {
        floor,
        column:
          column >= traps[floor] && traps[floor] >= 0 ? column + 1 : column,
      };
    }
    this.runs.set(player.id, {
      id: runId,
      difficulty,
      cols,
      bet,
      floor: 0,
      status: "playing",
      lucky: false,
      rows: Array.from({ length: TOWER_FLOORS }, () => ({
        picked: null,
        cells: null,
      })),
      payout: 0,
      startedAt: now,
      player,
      traps,
      gold,
      lastPickAt: 0,
      endedAt: null,
      absentSince: null,
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
    if (run.gold?.floor === run.floor - 1 && run.gold.column === column) {
      // The golden card cashes the floor reached and pays the player's pot.
      // The tower above turns gold for the show; nothing more is paid.
      const pot = this.pots.get(player.id) ?? 0;
      const bonus = towerLuckyPayout(pot);
      this.pots.set(player.id, Math.round((pot - bonus) * 100) / 100);
      run.lucky = true;
      this.finish(
        run,
        "cashed",
        now,
        towerPayout(run.bet, run.difficulty, run.floor) + bonus,
      );
      return;
    }
    if (run.floor === TOWER_FLOORS) this.finish(run, "topped", now);
  }

  private cashout(player: Player, now: number) {
    const run = this.activeRun(player);
    if (run.floor < 1)
      throw new Error("Franchissez au moins un étage avant d’encaisser.");
    this.finish(run, "cashed", now);
  }

  /**
   * Nothing is at risk before the first floor, so the wager is returned and
   * its share taken back from the Lucky pot.
   */
  private settleAbandoned(run: InternalRun, now: number) {
    if (run.floor) {
      this.finish(run, "cashed", now);
      return;
    }
    const pot = this.pots.get(run.player.id) ?? 0;
    this.pots.set(
      run.player.id,
      Math.max(0, Math.round((pot - run.bet * TOWER_LUCKY_SHARE) * 100) / 100),
    );
    this.finish(run, "cashed", now, run.bet);
  }

  private cells(run: InternalRun, floor: number): TowerCell[] {
    // Above the golden card, the whole tower is gold.
    if (run.lucky && run.gold && floor > run.gold.floor)
      return Array.from({ length: run.cols }, () => "gold");
    return Array.from({ length: run.cols }, (_, column) =>
      run.traps[floor] === column
        ? "trap"
        : run.gold?.floor === floor && run.gold.column === column
          ? "gold"
          : "safe",
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
    else if (status !== "lost")
      payout = towerPayout(run.bet, run.difficulty, run.floor);

    run.status = status;
    run.payout = payout;
    run.endedAt = now;
    if (payout > 0) {
      const refund = run.floor === 0 && payout === run.bet;
      let reason = "cashout";
      if (refund) reason = "abandoned-before-first-floor";
      else if (run.lucky) reason = "lucky-payout";
      else if (status === "topped") reason = "top";
      this.wallet.credit(run.player, {
        operationId: `tower:${run.id}:settlement`,
        game: "tower",
        kind: refund ? "refund" : "payout",
        reason,
        referenceId: run.id,
        amount: payout,
        metadata: {
          difficulty: run.difficulty,
          floor: run.floor,
          lucky: run.lucky,
        },
      });
    }
    for (let floor = 0; floor < TOWER_FLOORS; floor++)
      run.rows[floor].cells ??= this.cells(run, floor);

    const room = this.rooms.get(this.rooms.roomOf(run.player.id) ?? "");
    if (!room) return;
    const feed = this.feeds.get(room.id) ?? [];
    feed.unshift({
      id: run.id,
      name: run.player.name,
      status,
      difficulty: run.difficulty,
      floor: run.floor,
      lucky: run.lucky,
      amount: payout,
      timestamp: now,
    });
    this.feeds.set(room.id, feed.slice(0, FEED_SIZE));
  }

  private publicRun(run: InternalRun): TowerRun {
    // A climb refunded before its first card reveals nothing.
    const concealed = run.status === "cashed" && run.floor === 0;
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
        cells: concealed || !row.cells ? null : [...row.cells],
      })),
      payout: run.payout,
      startedAt: run.startedAt,
    };
  }

  private ghosts(room: Room): TowerGhost[] {
    const ghosts: TowerGhost[] = [];
    for (const playerId of room.members) {
      const run = this.runs.get(playerId);
      if (!run || run.ghostExpired) continue;
      ghosts.push({
        id: run.id,
        playerId: run.player.id,
        name: run.player.name,
        difficulty: run.difficulty,
        cols: run.cols,
        floor: run.floor,
        status: run.status,
        lucky: run.lucky,
        payout: run.payout,
      });
    }
    return ghosts;
  }
}

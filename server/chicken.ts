import { randomInt, randomUUID } from "node:crypto";
import type { Player } from "./engine";
import { gameEffect } from "./effect";
import { inMemoryGameWallet, type GameWallet } from "./game-wallet";
import { makeRoomRuntime } from "./rooms";
import {
  CHICKEN_BET_STEP,
  CHICKEN_DIFFICULTIES,
  CHICKEN_MAX_BET,
  CHICKEN_MIN_BET,
  CHICKEN_MULTIPLIERS,
  CHICKEN_ROOM_SIZE,
  chickenBet,
  chickenPayout,
  isChickenDifficulty,
} from "../src/lib/chicken";
import type {
  ChickenAutoConfig,
  ChickenAutoState,
  ChickenClientState,
  ChickenCommand,
  ChickenPublicState,
  ChickenRun,
  ChickenStatus,
} from "../src/lib/types";

export const CHICKEN_ABANDON_MS = 10 * 60_000;
const STEP_INTERVAL_MS = 350;
const ROUND_INTERVAL_MS = 950;
const INVITE_TTL_MS = 2 * 60_000;

type InternalRun = ChickenRun & {
  player: Player;
  /** A shuffled sequence of twenty safe or fatal positions, never sent to clients. */
  hazards: boolean[];
  lastStepAt: number;
  absentSince: number | null;
};
type InternalAuto = ChickenAutoState & { nextAt: number };

export class ChickenManager {
  private rooms = makeRoomRuntime("chicken", () =>
    randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(),
  );
  private runs = new Map<string, InternalRun>();
  private autos = new Map<string, InternalAuto>();
  private grants = new Map<string, number>();

  constructor(
    private send: (playerId: string, state: ChickenClientState) => void,
    private broadcast: (channel: string, state: ChickenPublicState) => void,
    private random: (max: number) => number = randomInt,
    private wallet: GameWallet = inMemoryGameWallet,
  ) {}

  roomIdOf(playerId: string) {
    const id = this.rooms.roomOf(playerId);
    return id ? this.rooms.channel(id) : undefined;
  }

  roomOf(playerId: string) {
    const id = this.rooms.roomOf(playerId);
    return id ? this.rooms.get(id) : undefined;
  }

  private publicState(roomId: string): ChickenPublicState {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Salon Chicken introuvable.");
    return {
      roomId,
      visibility: room.visibility,
      members: room.members.size,
      ghosts: [...room.members].flatMap((playerId) => {
        const run = this.runs.get(playerId);
        return run?.status === "playing" && run.absentSince === null
          ? [{ playerId, name: run.player.name, step: run.step }]
          : [];
      }),
    };
  }

  private publish(roomId: string, playerId?: string) {
    if (playerId) {
      const run = this.runs.get(playerId);
      this.send(playerId, {
        ...this.publicState(roomId),
        run: run ? this.clientRun(run) : null,
        auto: this.clientAuto(playerId),
      });
    }
    this.broadcast(this.rooms.channel(roomId), this.publicState(roomId));
  }

  refresh(player: Player) {
    const roomId = this.rooms.roomOf(player.id);
    if (roomId) this.publish(roomId, player.id);
  }

  private clientRun(run: InternalRun): ChickenRun {
    const { id, difficulty, bet, step, status, payout, startedAt } = run;
    return { id, difficulty, bet, step, status, payout, startedAt };
  }

  private clientAuto(playerId: string): ChickenAutoState | null {
    const auto = this.autos.get(playerId);
    if (!auto) return null;
    const { nextAt: _nextAt, ...state } = auto;
    return state;
  }

  /** Only a validated friend invitation grants entrance to a private room. */
  invite(fromId: string, friendId: string, roomId: string, now = Date.now()) {
    const room = this.roomOf(fromId);
    if (!room || room.id !== roomId || room.visibility !== "private")
      throw new Error("Rejoignez d’abord ce salon privé Chicken.");
    if (room.members.size >= CHICKEN_ROOM_SIZE)
      throw new Error(
        "Ce salon est plein. Réessayez lorsqu’une place se libère.",
      );
    this.grants.set(`${friendId}:${roomId}`, now + INVITE_TTL_MS);
  }

  /** Opens the public road, a new private road, or an invited private road. */
  enter(
    player: Player,
    options: {
      roomId?: string | null;
      createPrivate?: boolean;
      joinPublic?: boolean;
    } = {},
    now = Date.now(),
  ) {
    const previousId = this.rooms.roomOf(player.id);
    const previousRoom = previousId ? this.rooms.get(previousId) : undefined;
    let target = previousRoom;
    if (options.createPrivate) target = this.rooms.create("private");
    else if (options.joinPublic)
      target = this.rooms.publicRoom(
        (room) => room.members.size < CHICKEN_ROOM_SIZE,
      );
    else if (options.roomId) {
      target = this.rooms.get(options.roomId);
      if (!target || target.visibility !== "private")
        throw new Error("Ce salon privé n’existe plus.");
      if (previousId !== target.id) {
        const expiresAt = this.grants.get(`${player.id}:${target.id}`);
        if (!expiresAt || expiresAt < now)
          throw new Error("Cette invitation Chicken a expiré.");
      }
    } else if (!target) {
      target = this.rooms.publicRoom(
        (room) => room.members.size < CHICKEN_ROOM_SIZE,
      );
    }
    if (!target) throw new Error("Salon Chicken indisponible.");
    if (previousId !== target.id && target.members.size >= CHICKEN_ROOM_SIZE)
      throw new Error(
        "Ce salon est plein. Réessayez lorsqu’une place se libère.",
      );
    if (previousId && previousId !== target.id) {
      this.autos.delete(player.id);
      const run = this.runs.get(player.id);
      if (run?.status === "playing") this.settleAbandoned(run);
      this.rooms.leave(player.id);
      this.rooms.deleteEmpty(previousId);
      if (this.rooms.get(previousId))
        this.broadcast(
          this.rooms.channel(previousId),
          this.publicState(previousId),
        );
    }
    this.rooms.join(player.id, target.id);
    this.grants.delete(`${player.id}:${target.id}`);
    const run = this.runs.get(player.id);
    if (run) {
      run.player = player;
      run.absentSince = null;
    }
    this.publish(target.id, player.id);
    return { channel: this.rooms.channel(target.id), roomId: target.id };
  }

  enterEffect(
    player: Player,
    options?: {
      roomId?: string | null;
      createPrivate?: boolean;
      joinPublic?: boolean;
    },
  ) {
    return gameEffect((clock) => this.enter(player, options, clock.now()));
  }

  leave(player: Player, now = Date.now(), disconnected = false) {
    const roomId = this.rooms.roomOf(player.id);
    const run = this.runs.get(player.id);
    this.autos.delete(player.id);
    if (disconnected) {
      if (run?.status === "playing") {
        run.absentSince = now;
        if (roomId) this.publish(roomId);
      } else if (roomId) {
        this.rooms.leave(player.id);
        this.rooms.deleteEmpty(roomId);
        if (this.rooms.get(roomId)) this.publish(roomId);
      }
      return;
    }
    if (run?.status === "playing") this.settleAbandoned(run);
    this.runs.delete(player.id);
    if (!roomId) return;
    this.rooms.leave(player.id);
    this.rooms.deleteEmpty(roomId);
    if (this.rooms.get(roomId)) this.publish(roomId);
  }

  leaveEffect(player: Player, disconnected = false) {
    return gameEffect((clock) => this.leave(player, clock.now(), disconnected));
  }

  command(player: Player, command: ChickenCommand, now = Date.now()) {
    const roomId = this.rooms.roomOf(player.id);
    if (!roomId) throw new Error("Ouvrez Chicken pour jouer.");
    if (command.type === "start") {
      this.start(player, command.difficulty, command.bet, now);
      this.autos.delete(player.id);
    } else if (command.type === "advance") {
      if (this.autos.has(player.id))
        throw new Error("Arrêtez le mode auto pour avancer manuellement.");
      this.advance(player, now);
    } else if (command.type === "cashout") {
      const run = this.activeRun(player.id);
      if (run.step < 1)
        throw new Error("Faites au moins un saut avant d’encaisser.");
      this.autos.delete(player.id);
      this.finish(run, "cashed");
    } else if (command.type === "auto:start") {
      this.startAuto(player, command.config, now);
    } else if (command.type === "auto:stop") {
      this.autos.delete(player.id);
    }
    this.publish(roomId, player.id);
  }

  commandEffect(player: Player, command: ChickenCommand) {
    return gameEffect((clock) => this.command(player, command, clock.now()));
  }

  private start(
    player: Player,
    difficulty: ChickenRun["difficulty"],
    bet: number,
    now: number,
  ) {
    if (!isChickenDifficulty(difficulty))
      throw new Error("Choisissez une difficulté.");
    if (!chickenBet(bet))
      throw new Error(
        `La mise doit être comprise entre ${CHICKEN_MIN_BET} et ${CHICKEN_MAX_BET} crédits, par pas de ${CHICKEN_BET_STEP}.`,
      );
    if (this.runs.get(player.id)?.status === "playing")
      throw new Error("Terminez d’abord votre partie en cours.");
    if (this.wallet.balance(player) < bet)
      throw new Error("Votre solde est insuffisant.");
    const id = randomUUID();
    this.wallet.debit(player, {
      operationId: `chicken:${id}:wager`,
      game: "chicken",
      kind: "wager",
      reason: "start",
      referenceId: id,
      amount: bet,
      metadata: { difficulty },
    });
    // The 20-position draw and these hazard counts reproduce every published
    // multiplier at 98% RTP. Hazard counts are inferred from the payout table.
    const hazards = Array.from(
      { length: 20 },
      (_, index) => index < CHICKEN_DIFFICULTIES[difficulty].hazards,
    );
    for (let index = hazards.length - 1; index > 0; index--) {
      const selected = this.random(index + 1);
      [hazards[index], hazards[selected]] = [hazards[selected], hazards[index]];
    }
    this.runs.set(player.id, {
      id,
      player,
      difficulty,
      bet,
      step: 0,
      status: "playing",
      payout: 0,
      startedAt: now,
      hazards,
      lastStepAt: 0,
      absentSince: null,
    });
  }

  private activeRun(playerId: string) {
    const run = this.runs.get(playerId);
    if (!run || run.status !== "playing")
      throw new Error("Aucune partie Chicken en cours.");
    return run;
  }

  private advance(player: Player, now: number) {
    const run = this.activeRun(player.id);
    if (now - run.lastStepAt < STEP_INTERVAL_MS)
      throw new Error("Un instant… le poulet traverse.");
    run.lastStepAt = now;
    if (run.hazards[run.step]) {
      this.finish(run, "lost");
      return;
    }
    run.step++;
    if (run.step === CHICKEN_MULTIPLIERS[run.difficulty].length)
      this.finish(run, "finished");
  }

  private finish(
    run: InternalRun,
    status: Exclude<ChickenStatus, "playing">,
    payoutOverride?: number,
  ) {
    if (run.status !== "playing") return;
    const payout =
      payoutOverride ??
      (status === "lost"
        ? 0
        : chickenPayout(run.bet, run.difficulty, run.step));
    run.status = status;
    run.payout = payout;
    if (run.step > 0 || status === "lost")
      this.wallet.recordGameResult({
        userId: run.player.id,
        game: "chicken",
        playId: run.id,
        net: payout - run.bet,
      });
    if (payout > 0)
      this.wallet.credit(run.player, {
        operationId: `chicken:${run.id}:settlement`,
        game: "chicken",
        kind: run.step === 0 ? "refund" : "payout",
        reason: run.step === 0 ? "before-first-step" : status,
        referenceId: run.id,
        amount: payout,
        metadata: { difficulty: run.difficulty, step: run.step },
      });
    const auto = this.autos.get(run.player.id);
    if (auto) {
      auto.played++;
      auto.net += payout - run.bet;
      const percent = payout > run.bet ? auto.onWinPercent : auto.onLossPercent;
      const adjusted = run.bet * (1 + percent / 100);
      auto.nextBet = Math.round(adjusted / CHICKEN_BET_STEP) * CHICKEN_BET_STEP;
      auto.nextAt = run.lastStepAt + ROUND_INTERVAL_MS;
      if (
        auto.played >= auto.rounds ||
        (auto.stopProfit > 0 && auto.net >= auto.stopProfit) ||
        (auto.stopLoss > 0 && -auto.net >= auto.stopLoss)
      )
        this.autos.delete(run.player.id);
    }
  }

  private settleAbandoned(run: InternalRun) {
    if (run.status !== "playing") return;
    this.finish(run, "cashed", run.step === 0 ? run.bet : undefined);
  }

  private startAuto(player: Player, config: ChickenAutoConfig, now: number) {
    if (this.runs.get(player.id)?.status === "playing")
      throw new Error("Terminez votre partie avant de lancer le mode auto.");
    if (
      !isChickenDifficulty(config.difficulty) ||
      !chickenBet(config.bet) ||
      !Number.isInteger(config.steps) ||
      config.steps < 1 ||
      config.steps > CHICKEN_MULTIPLIERS[config.difficulty].length ||
      !Number.isInteger(config.rounds) ||
      config.rounds < 1 ||
      config.rounds > 1000 ||
      ![config.stopProfit, config.stopLoss].every(
        (value) => Number.isFinite(value) && value >= 0,
      ) ||
      ![config.onWinPercent, config.onLossPercent].every(
        (value) => Number.isFinite(value) && value >= -100 && value <= 500,
      )
    )
      throw new Error("Réglages du mode auto invalides.");
    if (this.wallet.balance(player) < config.bet)
      throw new Error("Votre solde est insuffisant.");
    this.start(player, config.difficulty, config.bet, now);
    this.autos.set(player.id, {
      ...config,
      played: 0,
      net: 0,
      nextBet: config.bet,
      nextAt: now + STEP_INTERVAL_MS,
    });
  }

  tick(now = Date.now()) {
    for (const [key, expiresAt] of this.grants)
      if (now > expiresAt) this.grants.delete(key);
    for (const [playerId, run] of this.runs) {
      if (
        run.status !== "playing" ||
        run.absentSince === null ||
        now - run.absentSince < CHICKEN_ABANDON_MS
      )
        continue;
      this.settleAbandoned(run);
      const roomId = this.rooms.roomOf(playerId);
      if (roomId) {
        this.rooms.leave(playerId);
        this.rooms.deleteEmpty(roomId);
        if (this.rooms.get(roomId)) this.publish(roomId);
      }
      this.runs.delete(playerId);
    }
    for (const [playerId, auto] of this.autos) {
      if (now < auto.nextAt) continue;
      const roomId = this.rooms.roomOf(playerId);
      const run = this.runs.get(playerId);
      if (!roomId || !run || run.absentSince !== null) {
        this.autos.delete(playerId);
        continue;
      }
      if (run.status === "playing") {
        if (run.step >= auto.steps) this.finish(run, "cashed");
        else this.advance(run.player, now);
        if (this.autos.has(playerId) && run.status === "playing")
          auto.nextAt = now + STEP_INTERVAL_MS;
      } else if (
        chickenBet(auto.nextBet) &&
        this.wallet.balance(run.player) >= auto.nextBet
      ) {
        this.start(run.player, auto.difficulty, auto.nextBet, now);
        auto.nextAt = now + STEP_INTERVAL_MS;
      } else {
        this.autos.delete(playerId);
      }
      this.publish(roomId, playerId);
    }
  }

  tickEffect(now?: number) {
    return gameEffect((clock) => this.tick(now ?? clock.now()));
  }
  forget(playerId: string) {
    this.autos.delete(playerId);
    this.runs.delete(playerId);
    for (const key of this.grants.keys())
      if (key.startsWith(`${playerId}:`)) this.grants.delete(key);
    const roomId = this.rooms.roomOf(playerId);
    if (roomId) {
      this.rooms.leave(playerId);
      this.rooms.deleteEmpty(roomId);
    }
  }
  forgetEffect(playerId: string) {
    return gameEffect(() => this.forget(playerId));
  }
}

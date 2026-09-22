import { randomInt } from "node:crypto";
import {
  isValidRouletteBet,
  rouletteBetId,
  rouletteReturn,
  rouletteTotal,
  ROULETTE_HISTORY_SIZE,
  ROULETTE_MAX_BETS,
  ROULETTE_MAX_TOTAL,
  ROULETTE_MIN_CHIP,
  type RouletteBet,
} from "../src/lib/roulette";
import type {
  RouletteCommand,
  RouletteResult,
  RouletteTableState,
} from "../src/lib/types";

/** The shared wallet and identity of a club member. */
export type RoulettePlayer = {
  id: string;
  name: string;
  balance: number;
  connected: boolean;
  lastSeen: number;
};

type Seat = {
  player: RoulettePlayer;
  ready: boolean;
  bets: RouletteBet[];
  /** Last layout that actually entered a spin, used by the repeat action. */
  previousBets: RouletteBet[];
  /** Layout debited for the spin in progress. */
  committed: RouletteBet[];
  /** Left during a spin: removed once paid. */
  leaving: boolean;
};

const BETTING_COUNTDOWN_MS = 10_000;
const ALL_READY_COUNTDOWN_MS = 3_000;
export const ROULETTE_SPIN_MS = 4_600;
const SETTLED_COUNTDOWN_MS = 6_000;
const MAX_PLAYERS = 8;

/** Keeps only the expected fields and merges repeated spots. */
export function normalizeRouletteBets(input: unknown): RouletteBet[] {
  if (!Array.isArray(input)) throw new Error("Les mises sont invalides.");
  const merged = new Map<string, RouletteBet>();
  for (const raw of input as RouletteBet[]) {
    const bet: RouletteBet = {
      kind: raw?.kind,
      selection: raw?.selection,
      amount: raw?.amount,
    };
    if (!isValidRouletteBet(bet))
      throw new Error("Une des mises n’est pas valide.");
    const id = rouletteBetId(bet);
    const existing = merged.get(id);
    if (existing) existing.amount += bet.amount;
    else merged.set(id, bet);
  }
  const bets = [...merged.values()];
  if (bets.length > ROULETTE_MAX_BETS)
    throw new Error("Trop de mises différentes sur le tapis.");
  if (rouletteTotal(bets) > ROULETTE_MAX_TOTAL)
    throw new Error(
      `La mise totale est limitée à ${ROULETTE_MAX_TOTAL} crédits.`,
    );
  return bets;
}

/**
 * Shared European roulette table. It follows the Blackjack rhythm: everyone
 * lays chips during the betting phase and the ball leaves 10 seconds after
 * the first player is ready, so the others still have time to bet. Only a
 * table where every seated player is ready shortens it to 3 seconds. The
 * results then stay on the felt for a few seconds.
 */
export class RouletteTable {
  private phase: RouletteTableState["phase"] = "betting";
  private round = 0;
  private deadline: number | null = null;
  private number: number | null = null;
  private history: number[] = [];
  private results: RouletteResult[] = [];
  private seats = new Map<string, Seat>();
  lastUsed = Date.now();

  constructor(
    readonly id: string,
    private readonly publish: () => void = () => {},
    private readonly draw: () => number = () => randomInt(37),
  ) {}

  get size() {
    return this.seats.size;
  }

  snapshot(): RouletteTableState {
    return {
      id: this.id,
      phase: this.phase,
      round: this.round,
      deadline: this.deadline,
      number: this.phase === "betting" ? null : this.number,
      history: this.history,
      results: this.results,
      players: [...this.seats.values()].map((seat) => ({
        id: seat.player.id,
        name: seat.player.name,
        connected: seat.player.connected,
        ready: seat.ready,
        // During a spin the felt shows what is actually played.
        bets: this.phase === "betting" ? seat.bets : seat.committed,
        previousTotal: rouletteTotal(seat.previousBets),
      })),
    };
  }

  private emit() {
    this.lastUsed = Date.now();
    this.publish();
  }

  join(player: RoulettePlayer) {
    if (!this.seats.has(player.id)) {
      if (this.seats.size >= MAX_PLAYERS)
        throw new Error("La table de roulette est complète.");
      this.seats.set(player.id, {
        player,
        ready: false,
        bets: [],
        previousBets: [],
        committed: [],
        leaving: false,
      });
    }
    this.seats.get(player.id)!.leaving = false;
    this.emit();
  }

  /** Leaving only drops unplayed chips: a spin in progress is still paid. */
  leave(playerId: string) {
    const seat = this.seats.get(playerId);
    if (!seat) return;
    if (seat.committed.length) {
      seat.bets = [];
      seat.ready = false;
      seat.leaving = true;
      this.emit();
      return;
    }
    this.seats.delete(playerId);
    this.updateCountdown(true);
    this.emit();
  }

  command(playerId: string, command: RouletteCommand) {
    const seat = this.seats.get(playerId);
    if (!seat) throw new Error("Rejoignez la table de roulette pour jouer.");
    if (!command || typeof command !== "object")
      throw new Error("Action invalide.");
    if (this.phase !== "betting")
      throw new Error("Rien ne va plus : attendez la prochaine manche.");
    switch (command.type) {
      case "bets": {
        if (seat.ready)
          throw new Error("Annulez « Je suis prêt » pour modifier vos mises.");
        const bets = normalizeRouletteBets(command.bets);
        if (rouletteTotal(bets) > seat.player.balance)
          throw new Error("Vous n’avez pas assez de crédits.");
        seat.bets = bets;
        break;
      }
      case "repeat": {
        if (seat.ready)
          throw new Error("Annulez « Je suis prêt » pour modifier vos mises.");
        if (!seat.previousBets.length)
          throw new Error("Aucune mise précédente à répéter.");
        if (rouletteTotal(seat.previousBets) > seat.player.balance)
          throw new Error("Vous n’avez pas assez de crédits.");
        seat.bets = seat.previousBets.map((bet) => ({ ...bet }));
        break;
      }
      case "ready": {
        if (typeof command.ready !== "boolean")
          throw new Error("Action invalide.");
        const total = rouletteTotal(seat.bets);
        if (
          command.ready &&
          (total < ROULETTE_MIN_CHIP || total > seat.player.balance)
        )
          throw new Error("Vérifiez vos mises et votre solde.");
        seat.ready = command.ready;
        break;
      }
      default:
        throw new Error("Action Roulette inconnue.");
    }
    this.updateCountdown();
    this.emit();
  }

  private updateCountdown(reset = false) {
    if (this.phase !== "betting") return;
    // Everyone seated counts, including players who have not bet yet.
    const seated = [...this.seats.values()].filter(
      (seat) => seat.player.connected && !seat.leaving,
    );
    const ready = seated.filter((seat) => seat.ready);
    if (!ready.length) this.deadline = null;
    else if (ready.length === seated.length)
      this.deadline = Math.min(
        reset ? Infinity : (this.deadline ?? Infinity),
        Date.now() + ALL_READY_COUNTDOWN_MS,
      );
    else if (reset || this.deadline === null)
      this.deadline = Date.now() + BETTING_COUNTDOWN_MS;
  }

  private startSpin(now: number) {
    const playing: Seat[] = [];
    for (const seat of this.seats.values()) {
      const total = rouletteTotal(seat.bets);
      // The wallet is shared with the other games: a player who spent it
      // elsewhere since confirming sits this spin out.
      if (
        seat.ready &&
        seat.player.connected &&
        total >= ROULETTE_MIN_CHIP &&
        total <= seat.player.balance
      )
        playing.push(seat);
      else {
        seat.ready = false;
        seat.bets = [];
      }
    }
    if (!playing.length) {
      this.deadline = null;
      this.emit();
      return;
    }
    for (const seat of playing) {
      seat.player.balance -= rouletteTotal(seat.bets);
      seat.committed = seat.bets;
      seat.previousBets = seat.bets.map((bet) => ({ ...bet }));
      seat.bets = [];
    }
    this.round += 1;
    this.number = this.draw();
    this.phase = "spinning";
    this.deadline = now + ROULETTE_SPIN_MS;
    this.results = [];
    this.emit();
  }

  private settle(now: number) {
    const number = this.number!;
    this.results = [];
    for (const seat of this.seats.values()) {
      if (!seat.committed.length) continue;
      const total = rouletteTotal(seat.committed);
      const payout = rouletteReturn(seat.committed, number);
      seat.player.balance += payout;
      this.results.push({
        playerId: seat.player.id,
        name: seat.player.name,
        total,
        payout,
        net: payout - total,
      });
    }
    this.history = [number, ...this.history].slice(0, ROULETTE_HISTORY_SIZE);
    this.phase = "settled";
    this.deadline = now + SETTLED_COUNTDOWN_MS;
    this.emit();
  }

  private reopen() {
    for (const [playerId, seat] of this.seats) {
      seat.committed = [];
      seat.ready = false;
      // Players who left during the spin are removed once they are paid.
      if (seat.leaving) this.seats.delete(playerId);
    }
    this.phase = "betting";
    this.deadline = null;
    this.number = null;
    this.results = [];
    this.emit();
  }

  tick(now = Date.now()) {
    if (this.phase === "betting") {
      for (const [playerId, seat] of this.seats)
        if (!seat.player.connected && now - seat.player.lastSeen > 60_000) {
          this.seats.delete(playerId);
          this.emit();
        }
      const before = this.deadline;
      this.updateCountdown();
      if (this.deadline !== before) this.emit();
      if (this.deadline && now >= this.deadline) this.startSpin(now);
    } else if (this.deadline && now >= this.deadline) {
      if (this.phase === "spinning") this.settle(now);
      else this.reopen();
    }
  }
}

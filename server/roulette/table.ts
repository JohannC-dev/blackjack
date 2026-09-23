import { Clock, Effect, Either, Option } from "effect";
import {
  rouletteReturn,
  rouletteTotal,
  ROULETTE_HISTORY_SIZE,
  ROULETTE_MIN_CHIP,
  type RouletteBet,
} from "../../src/lib/roulette";
import type {
  RouletteCommand,
  RouletteResult,
  RouletteTableState,
} from "../../src/lib/types";
import {
  BettingClosed,
  CannotBeReady,
  InsufficientCredits,
  NothingToRepeat,
  NotSeated,
  ReadyLocked,
  TableFull,
} from "./errors";
import { Players, Wallet, Wheel } from "./services";

export const BETTING_COUNTDOWN_MS = 10_000;
export const ALL_READY_COUNTDOWN_MS = 3_000;
export const ROULETTE_SPIN_MS = 4_600;
export const SETTLED_COUNTDOWN_MS = 6_000;
/** A disconnected player keeps the seat this long so a reload finds it. */
export const SEAT_GRACE_MS = 60_000;
export const MAX_PLAYERS = 8;

export type Seat = {
  readonly playerId: string;
  /** Name at the time of joining, used if the member is no longer known. */
  readonly name: string;
  readonly ready: boolean;
  readonly bets: readonly RouletteBet[];
  /** Last layout that actually entered a spin, used by the repeat action. */
  readonly previousBets: readonly RouletteBet[];
  /** Layout debited for the spin in progress. */
  readonly committed: readonly RouletteBet[];
  /** Left during a spin: removed once paid. */
  readonly leaving: boolean;
};

/**
 * Shared European roulette table, as an immutable value. Every transition
 * returns a new table (or the same one when nothing changed), so the manager
 * can commit it atomically and publish only real changes.
 *
 * It follows the Blackjack rhythm: everyone lays chips during the betting
 * phase and the ball leaves 10 seconds after the first player is ready, so
 * the others still have time to bet. Only a table where every seated player
 * is ready shortens it to 3 seconds. The results then stay on the felt for a
 * few seconds.
 */
export type Table = {
  readonly id: string;
  readonly phase: RouletteTableState["phase"];
  readonly round: number;
  readonly deadline: number | null;
  readonly number: number | null;
  /** Most recent number first. */
  readonly history: readonly number[];
  readonly results: readonly RouletteResult[];
  readonly seats: readonly Seat[];
  readonly lastUsed: number;
};

export const emptyTable = (id: string, now: number): Table => ({
  id,
  phase: "betting",
  round: 0,
  deadline: null,
  number: null,
  history: [],
  results: [],
  seats: [],
  lastUsed: now,
});

const findSeat = (table: Table, playerId: string) =>
  Option.fromNullable(table.seats.find((seat) => seat.playerId === playerId));

const updateSeat = (
  table: Table,
  playerId: string,
  update: (seat: Seat) => Seat,
): Table => ({
  ...table,
  seats: table.seats.map((seat) =>
    seat.playerId === playerId ? update(seat) : seat,
  ),
});

const isConnected = (playerId: string) =>
  Effect.flatMap(Players, (players) => players.get(playerId)).pipe(
    Effect.map(Option.exists((player) => player.connected)),
  );

const balanceOf = (playerId: string) =>
  Effect.gen(function* () {
    const players = yield* Players;
    const wallet = yield* Wallet;
    const player = yield* players.get(playerId);
    return Option.match(player, {
      onNone: () => 0,
      onSome: (account) => wallet.balance(account),
    });
  });

/** Recomputes the betting countdown from who is seated and ready. */
const updateCountdown = (table: Table, reset = false) =>
  Effect.gen(function* () {
    if (table.phase !== "betting") return table;
    const now = yield* Clock.currentTimeMillis;
    // Everyone seated counts, including players who have not bet yet.
    const seated = yield* Effect.filter(table.seats, (seat) =>
      seat.leaving ? Effect.succeed(false) : isConnected(seat.playerId),
    );
    const ready = seated.filter((seat) => seat.ready).length;
    let deadline = table.deadline;
    if (!ready) deadline = null;
    else if (ready === seated.length)
      deadline = Math.min(
        reset ? Infinity : (deadline ?? Infinity),
        now + ALL_READY_COUNTDOWN_MS,
      );
    else if (reset || deadline === null) deadline = now + BETTING_COUNTDOWN_MS;
    return deadline === table.deadline ? table : { ...table, deadline };
  });

export const join = (table: Table, playerId: string) =>
  Effect.gen(function* () {
    const seat = findSeat(table, playerId);
    if (Option.isSome(seat))
      return seat.value.leaving
        ? updateSeat(table, playerId, (s) => ({ ...s, leaving: false }))
        : table;
    if (table.seats.length >= MAX_PLAYERS) return yield* new TableFull();
    const player = yield* Effect.flatMap(Players, (p) => p.get(playerId));
    const next: Seat = {
      playerId,
      name: Option.match(player, {
        onNone: () => "Joueur",
        onSome: (p) => p.name,
      }),
      ready: false,
      bets: [],
      previousBets: [],
      committed: [],
      leaving: false,
    };
    return { ...table, seats: [...table.seats, next] };
  });

/** Leaving only drops unplayed chips: a spin in progress is still paid. */
export const leave = (table: Table, playerId: string) =>
  Effect.gen(function* () {
    const seat = findSeat(table, playerId);
    if (Option.isNone(seat)) return table;
    if (seat.value.committed.length)
      return updateSeat(table, playerId, (s) => ({
        ...s,
        bets: [],
        ready: false,
        leaving: true,
      }));
    return yield* updateCountdown(
      { ...table, seats: table.seats.filter((s) => s.playerId !== playerId) },
      true,
    );
  });

export const command = (
  table: Table,
  playerId: string,
  command: RouletteCommand,
) =>
  Effect.gen(function* () {
    const seat = yield* findSeat(table, playerId).pipe(
      Effect.mapError(() => new NotSeated()),
    );
    if (table.phase !== "betting") return yield* new BettingClosed();
    const balance = yield* balanceOf(playerId);
    let next: Seat;
    switch (command.type) {
      case "bets": {
        if (seat.ready) return yield* new ReadyLocked();
        if (rouletteTotal(command.bets) > balance)
          return yield* new InsufficientCredits();
        next = { ...seat, bets: command.bets };
        break;
      }
      case "repeat": {
        if (seat.ready) return yield* new ReadyLocked();
        if (!seat.previousBets.length) return yield* new NothingToRepeat();
        if (rouletteTotal(seat.previousBets) > balance)
          return yield* new InsufficientCredits();
        next = { ...seat, bets: seat.previousBets };
        break;
      }
      case "ready": {
        const total = rouletteTotal(seat.bets);
        if (command.ready && (total < ROULETTE_MIN_CHIP || total > balance))
          return yield* new CannotBeReady();
        next = { ...seat, ready: command.ready };
        break;
      }
    }
    return yield* updateCountdown(updateSeat(table, playerId, () => next));
  });

/**
 * Takes the stakes and launches the ball. The wallet is shared with the
 * other games: a player who spent it elsewhere since confirming, or who is
 * gone, sits this spin out and keeps the credits. The number is drawn before
 * any stake is taken, so nothing can fail once a wallet has been debited.
 */
const startSpin = (table: Table, now: number) =>
  Effect.gen(function* () {
    const players = yield* Players;
    const wallet = yield* Wallet;
    const number = yield* Effect.flatMap(Wheel, (wheel) => wheel.spin);
    const round = table.round + 1;
    let playing = 0;
    const seats = yield* Effect.forEach(table.seats, (seat) =>
      Effect.gen(function* () {
        const total = rouletteTotal(seat.bets);
        const eligible =
          seat.ready &&
          total >= ROULETTE_MIN_CHIP &&
          (yield* isConnected(seat.playerId));
        let debit: Either.Either<void, InsufficientCredits> = Either.left(
          new InsufficientCredits(),
        );
        if (eligible) {
          const player = yield* players.get(seat.playerId);
          if (Option.isSome(player))
            debit = yield* Effect.either(
              Effect.try({
                try: () =>
                  wallet.debit(player.value, {
                    operationId: `roulette:${table.id}:${round}:${seat.playerId}:wager`,
                    game: "roulette",
                    kind: "wager",
                    reason: "spin",
                    referenceId: `${table.id}:${round}`,
                    amount: total,
                    metadata: { number, bets: seat.bets.length },
                  }),
                catch: () => new InsufficientCredits(),
              }),
            );
        }
        if (Either.isLeft(debit))
          return { ...seat, ready: false, bets: [] } satisfies Seat;
        playing += 1;
        return {
          ...seat,
          committed: seat.bets,
          previousBets: seat.bets,
          bets: [],
        } satisfies Seat;
      }),
    );
    if (!playing) return { ...table, seats, deadline: null };
    return {
      ...table,
      seats,
      round,
      number,
      phase: "spinning",
      deadline: now + ROULETTE_SPIN_MS,
      results: [],
    } satisfies Table;
  });

/**
 * Lands the ball and computes what each committed layout returns. The table
 * only records the results: the credits are paid by the manager once the
 * settled table is committed, so a round can never be paid twice.
 */
const settle = (table: Table, now: number) =>
  Effect.gen(function* () {
    const players = yield* Players;
    const number = table.number ?? 0;
    const results: RouletteResult[] = [];
    for (const seat of table.seats) {
      if (!seat.committed.length) continue;
      const total = rouletteTotal(seat.committed);
      const payout = rouletteReturn(seat.committed, number);
      const player = yield* players.get(seat.playerId);
      results.push({
        playerId: seat.playerId,
        name: Option.match(player, {
          onNone: () => seat.name,
          onSome: (p) => p.name,
        }),
        total,
        payout,
        net: payout - total,
      });
    }
    return {
      ...table,
      results,
      history: [number, ...table.history].slice(0, ROULETTE_HISTORY_SIZE),
      phase: "settled",
      deadline: now + SETTLED_COUNTDOWN_MS,
    } satisfies Table;
  });

/** Credits owed by a transition: only the landing of the ball pays. */
export const payouts = (before: Table, after: Table) =>
  before.phase === "spinning" && after.phase === "settled"
    ? after.results.filter((result) => result.payout > 0)
    : [];

const reopen = (table: Table): Table => ({
  ...table,
  // Players who left during the spin are removed once they are paid.
  seats: table.seats
    .filter((seat) => !seat.leaving)
    .map((seat) => ({ ...seat, committed: [], ready: false })),
  phase: "betting",
  deadline: null,
  number: null,
  results: [],
});

/** Advances the table clock: countdown, spin, payout, next round. */
export const tick = (table: Table) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (table.phase === "betting") {
      const players = yield* Players;
      const seats = yield* Effect.filter(table.seats, (seat) =>
        players
          .get(seat.playerId)
          .pipe(
            Effect.map(
              Option.exists(
                (player) =>
                  player.connected || now - player.lastSeen <= SEAT_GRACE_MS,
              ),
            ),
          ),
      );
      let next =
        seats.length === table.seats.length ? table : { ...table, seats };
      next = yield* updateCountdown(next);
      if (next.deadline !== null && now >= next.deadline)
        next = yield* startSpin(next, now);
      return next;
    }
    if (table.deadline === null || now < table.deadline) return table;
    return table.phase === "spinning"
      ? yield* settle(table, now)
      : reopen(table);
  });

/** Public view of the table, sent to every connection sitting at it. */
export const snapshot = (table: Table) =>
  Effect.gen(function* () {
    const players = yield* Players;
    const betting = table.phase === "betting";
    return {
      id: table.id,
      phase: table.phase,
      round: table.round,
      deadline: table.deadline,
      number: betting ? null : table.number,
      history: [...table.history],
      results: [...table.results],
      players: yield* Effect.forEach(table.seats, (seat) =>
        players.get(seat.playerId).pipe(
          Effect.map((player) => ({
            id: seat.playerId,
            name: Option.match(player, {
              onNone: () => seat.name,
              onSome: (p) => p.name,
            }),
            connected: Option.exists(player, (p) => p.connected),
            ready: seat.ready,
            // During a spin the felt shows what is actually played.
            bets: [...(betting ? seat.bets : seat.committed)],
            previousTotal: rouletteTotal(seat.previousBets),
          })),
        ),
      ),
    } satisfies RouletteTableState;
  });

import { Cause, Clock, Effect, Option, SynchronizedRef } from "effect";
import {
  NotAtTable,
  NotShowingRoulette,
  TablesExhausted,
  type RouletteError,
} from "./errors";
import { decodeCommand } from "./schema";
import { Players, Transport, Wallet, Wheel } from "./services";
import * as Table from "./table";

const MAX_TABLES = 200;
/** An empty table is forgotten after this long without activity. */
const IDLE_TABLE_MS = 30 * 60_000;

/**
 * Everything the Roulette remembers, as one immutable value: the tables, the
 * table of each player and the connections showing it.
 */
type Registry = {
  readonly tables: ReadonlyMap<string, Table.Table>;
  readonly seats: ReadonlyMap<string, string>;
  readonly sockets: ReadonlyMap<string, ReadonlySet<string>>;
};

type Env = Players | Wallet | Wheel | Transport;
/** Notifications sent once a new registry is committed. */
type Outbox = Effect.Effect<void, never, Env>[];

const publish = (table: Table.Table) =>
  Effect.flatMap(Table.snapshot(table), (state) =>
    Effect.flatMap(Transport, (transport) => transport.publish(state)),
  );

/**
 * The Roulette of the club. Every operation reads the registry, computes the
 * next one and commits it in a single step; the notifications only leave
 * once it is committed. A refused command therefore never leaves a table half
 * updated, and a table that crashes on a tick is isolated from the others.
 */
export class Roulette extends Effect.Service<Roulette>()("Roulette", {
  effect: Effect.gen(function* () {
    const env = yield* Effect.context<Env>();
    const registry = yield* SynchronizedRef.make<Registry>({
      tables: new Map(),
      seats: new Map(),
      sockets: new Map(),
    });

    /** Applies a transition, then sends what it produced. */
    const transact = <A, E>(
      step: (
        current: Registry,
      ) => Effect.Effect<readonly [A, Registry, Outbox], E, Env>,
    ) =>
      SynchronizedRef.modifyEffect(registry, (current) =>
        Effect.map(step(current), ([value, next, outbox]) => [
          [value, outbox] as const,
          next,
        ]),
      ).pipe(
        Effect.tap(([, outbox]) => Effect.all(outbox, { discard: true })),
        Effect.map(([value]) => value),
        Effect.provide(env),
      );

    /** Stores a table, publishing it and marking it used when it changed. */
    const commit = (
      tables: Map<string, Table.Table>,
      outbox: Outbox,
      before: Table.Table | undefined,
      after: Table.Table,
      now: number,
    ) => {
      if (before === after) return;
      const used = { ...after, lastUsed: now };
      tables.set(used.id, used);
      outbox.push(publish(used));
    };

    /**
     * Sits the player at `tableId`, leaving the previous table if the table
     * code changed. The Roulette table follows the Blackjack table code, so
     * friends invited with ?table=CODE also share the same wheel.
     */
    const join = (socketId: string, playerId: string, tableId: string) =>
      transact((current) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const tables = new Map(current.tables);
          const seats = new Map(current.seats);
          const sockets = new Map(current.sockets);
          const outbox: Outbox = [];
          const connections = new Set(sockets.get(playerId));
          const previous = seats.get(playerId);
          if (previous !== undefined && previous !== tableId) {
            const table = tables.get(previous);
            if (table)
              commit(
                tables,
                outbox,
                table,
                yield* Table.leave(table, playerId),
                now,
              );
            outbox.push(
              Effect.flatMap(Transport, (t) => t.exit(connections, previous)),
            );
          }
          const existing = tables.get(tableId);
          if (!existing && tables.size >= MAX_TABLES)
            return yield* new TablesExhausted();
          const table = existing ?? Table.emptyTable(tableId, now);
          const joined = yield* Table.join(table, playerId);
          connections.add(socketId);
          seats.set(playerId, tableId);
          sockets.set(playerId, connections);
          tables.set(tableId, { ...joined, lastUsed: now });
          // The new connections enter the room first so they get the table.
          outbox.push(
            Effect.flatMap(Transport, (t) => t.enter(connections, tableId)),
            publish(joined),
          );
          return [undefined, { tables, seats, sockets }, outbox] as const;
        }),
      );

    /**
     * Closes the Roulette on one connection. The seat is only released once
     * the last connection of the player showing it is closed.
     */
    const leave = (socketId: string, playerId: string) =>
      transact((current) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const connections = current.sockets.get(playerId);
          if (!connections?.has(socketId))
            return [undefined, current, []] as const;
          const tables = new Map(current.tables);
          const seats = new Map(current.seats);
          const sockets = new Map(current.sockets);
          const outbox: Outbox = [];
          const tableId = seats.get(playerId);
          if (tableId !== undefined)
            outbox.push(
              Effect.flatMap(Transport, (t) => t.exit([socketId], tableId)),
            );
          const remaining = new Set(connections);
          remaining.delete(socketId);
          if (remaining.size) {
            sockets.set(playerId, remaining);
            return [undefined, { tables, seats, sockets }, outbox] as const;
          }
          sockets.delete(playerId);
          seats.delete(playerId);
          const table = tableId === undefined ? undefined : tables.get(tableId);
          if (table)
            commit(
              tables,
              outbox,
              table,
              yield* Table.leave(table, playerId),
              now,
            );
          return [undefined, { tables, seats, sockets }, outbox] as const;
        }),
      );

    /** A dropped connection keeps the seat a minute so a reload finds it. */
    const disconnect = (socketId: string, playerId: string) =>
      transact((current) => {
        const connections = current.sockets.get(playerId);
        if (!connections?.has(socketId))
          return Effect.succeed([undefined, current, []] as const);
        const sockets = new Map(current.sockets);
        const remaining = new Set(connections);
        remaining.delete(socketId);
        if (remaining.size) sockets.set(playerId, remaining);
        else sockets.delete(playerId);
        return Effect.succeed([
          undefined,
          { ...current, sockets },
          [],
        ] as const);
      });

    /**
     * Applies a command sent by a connection. Only a connection showing the
     * table may bet: a tab left on another game cannot act on the wheel.
     */
    const command = (socketId: string, playerId: string, input: unknown) =>
      transact((current) =>
        Effect.gen(function* () {
          if (!current.sockets.get(playerId)?.has(socketId))
            return yield* new NotShowingRoulette();
          const tableId = current.seats.get(playerId);
          const table =
            tableId === undefined ? undefined : current.tables.get(tableId);
          if (!table) return yield* new NotAtTable();
          const decoded = yield* decodeCommand(input);
          const next = yield* Table.command(table, playerId, decoded);
          const now = yield* Clock.currentTimeMillis;
          const tables = new Map(current.tables);
          const outbox: Outbox = [];
          commit(tables, outbox, table, next, now);
          return [undefined, { ...current, tables }, outbox] as const;
        }),
      );

    /** Advances one table; forgets it once empty and idle. */
    const tickTable = (tableId: string) =>
      transact((current) =>
        Effect.gen(function* () {
          const table = current.tables.get(tableId);
          if (!table) return [undefined, current, []] as const;
          const now = yield* Clock.currentTimeMillis;
          const next = yield* Table.tick(table);
          const tables = new Map(current.tables);
          // Winnings are paid once the settled table is committed.
          const outbox: Outbox = Table.payouts(table, next).map((result) =>
            Effect.gen(function* () {
              const players = yield* Players;
              const wallet = yield* Wallet;
              const player = yield* players.get(result.playerId);
              if (Option.isSome(player))
                wallet.credit(player.value, {
                  operationId: `roulette:${table.id}:${next.round}:${result.playerId}:settlement`,
                  game: "roulette",
                  kind: "payout",
                  reason: "settlement",
                  referenceId: `${table.id}:${next.round}`,
                  amount: result.payout,
                  metadata: {
                    number: next.number,
                    stake: result.total,
                    net: result.net,
                  },
                });
            }),
          );
          commit(tables, outbox, table, next, now);
          const after = tables.get(tableId)!;
          if (!after.seats.length && now - after.lastUsed > IDLE_TABLE_MS)
            tables.delete(tableId);
          return [undefined, { ...current, tables }, outbox] as const;
        }),
      ).pipe(
        // A broken table must not stop the wheels of the others.
        Effect.catchAllCause((cause) =>
          Effect.logError(`Roulette ${tableId}`, Cause.pretty(cause)),
        ),
      );

    const tick = Effect.flatMap(SynchronizedRef.get(registry), (current) =>
      Effect.forEach(current.tables.keys(), tickTable, { discard: true }),
    );

    /** Drops what is left of a member forgotten by the club. */
    const forget = (playerId: string) =>
      transact((current) => {
        const seats = new Map(current.seats);
        const sockets = new Map(current.sockets);
        seats.delete(playerId);
        sockets.delete(playerId);
        return Effect.succeed([
          undefined,
          { ...current, seats, sockets },
          [],
        ] as const);
      });

    /** Current public view of a table, if it exists. */
    const state = (tableId: string) =>
      Effect.flatMap(SynchronizedRef.get(registry), (current) => {
        const table = current.tables.get(tableId);
        return table
          ? Effect.asSome(Table.snapshot(table))
          : Effect.succeedNone;
      }).pipe(Effect.provide(env));

    return {
      join,
      leave,
      disconnect,
      command,
      tick,
      forget,
      state,
    } as const;
  }),
}) {}

export type { RouletteError };

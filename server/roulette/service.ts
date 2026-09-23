import { Cause, Clock, Effect, Option, SynchronizedRef } from "effect";
import {
  deleteEmptyRoom,
  emptyRoomState,
  getRoom,
  joinRoom,
  leaveRoom,
  privateRoom,
  publicRoom,
  roomOf,
  type RoomState,
} from "../rooms";
import { NotAtTable, NotShowingRoulette, type RouletteError } from "./errors";
import { decodeCommand } from "./schema";
import { Players, Transport, Wallet, Wheel } from "./services";
import * as Table from "./table";

/** An empty table is forgotten after this long without activity. */
const IDLE_TABLE_MS = 30 * 60_000;

/**
 * Everything the Roulette remembers, as one immutable value: the tables, the
 * table of each player and the connections showing it.
 */
type Registry = {
  readonly tables: ReadonlyMap<string, Table.Table>;
  readonly rooms: RoomState;
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
 * The Roulette pool. Every operation reads the registry, computes the
 * next one and commits it in a single step; the notifications only leave
 * once it is committed. A refused command therefore never leaves a table half
 * updated, and a table that crashes on a tick is isolated from the others.
 */
export class Roulette extends Effect.Service<Roulette>()("Roulette", {
  effect: Effect.gen(function* () {
    const env = yield* Effect.context<Env>();
    const registry = yield* SynchronizedRef.make<Registry>({
      tables: new Map(),
      rooms: emptyRoomState(),
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

    /** Automatically seats the player at an available roulette table. */
    const join = (
      socketId: string,
      playerId: string,
      requestedTableId?: string,
    ) =>
      transact((current) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const tables = new Map(current.tables);
          let rooms = current.rooms;
          const sockets = new Map(current.sockets);
          const outbox: Outbox = [];
          const connections = new Set(sockets.get(playerId));
          const previous = roomOf(rooms, playerId);
          const requested =
            requestedTableId === undefined
              ? undefined
              : getRoom(rooms, requestedTableId);
          // A friend's invitation may name a public table: it is joined as is.
          const selected =
            requested?.visibility === "public"
              ? { value: requested, state: rooms }
              : requestedTableId
                ? yield* privateRoom(rooms, requestedTableId)
                : previous &&
                    getRoom(rooms, previous)?.visibility === "public" &&
                    tables.has(previous)
                  ? { value: getRoom(rooms, previous)!, state: rooms }
                  : yield* publicRoom(rooms, (room) => {
                      const table = tables.get(room.id);
                      return !table || table.seats.length < Table.MAX_PLAYERS;
                    });
          rooms = selected.state;
          const tableId = selected.value.id;
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
          const table = existing ?? Table.emptyTable(tableId, now);
          const joined = yield* Table.join(table, playerId);
          connections.add(socketId);
          rooms = (yield* joinRoom(rooms, playerId, tableId)).state;
          sockets.set(playerId, connections);
          tables.set(tableId, { ...joined, lastUsed: now });
          // The new connections enter the room first so they get the table.
          outbox.push(
            Effect.flatMap(Transport, (t) => t.enter(connections, tableId)),
            publish(joined),
          );
          return [undefined, { tables, rooms, sockets }, outbox] as const;
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
          const rooms = current.rooms;
          const sockets = new Map(current.sockets);
          const outbox: Outbox = [];
          const tableId = roomOf(rooms, playerId);
          if (tableId !== undefined)
            outbox.push(
              Effect.flatMap(Transport, (t) => t.exit([socketId], tableId)),
            );
          const remaining = new Set(connections);
          remaining.delete(socketId);
          if (remaining.size) {
            sockets.set(playerId, remaining);
            return [undefined, { tables, rooms, sockets }, outbox] as const;
          }
          sockets.delete(playerId);
          const nextRooms = leaveRoom(rooms, playerId).state;
          const table = tableId === undefined ? undefined : tables.get(tableId);
          if (table)
            commit(
              tables,
              outbox,
              table,
              yield* Table.leave(table, playerId),
              now,
            );
          return [
            undefined,
            { tables, rooms: nextRooms, sockets },
            outbox,
          ] as const;
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
          const tableId = roomOf(current.rooms, playerId);
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
          let rooms = current.rooms;
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
          if (table.phase !== "settled" && next.phase === "settled")
            outbox.push(
              Effect.gen(function* () {
                const wallet = yield* Wallet;
                for (const result of next.results)
                  wallet.recordGameResult({
                    userId: result.playerId,
                    game: "roulette",
                    playId: `${table.id}:${next.round}`,
                    net: result.net,
                  });
              }),
            );
          commit(tables, outbox, table, next, now);
          for (const seat of table.seats)
            if (
              !next.seats.some(
                (nextSeat) => nextSeat.playerId === seat.playerId,
              )
            )
              rooms = leaveRoom(rooms, seat.playerId).state;
          const after = tables.get(tableId)!;
          if (!after.seats.length && now - after.lastUsed > IDLE_TABLE_MS) {
            tables.delete(tableId);
            rooms = deleteEmptyRoom(rooms, tableId).state;
          }
          return [undefined, { ...current, tables, rooms }, outbox] as const;
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
        const rooms = leaveRoom(current.rooms, playerId).state;
        const sockets = new Map(current.sockets);
        sockets.delete(playerId);
        return Effect.succeed([
          undefined,
          { ...current, rooms, sockets },
          [],
        ] as const);
      });

    /** Table where a player sits, with its visibility. */
    const tableOf = (playerId: string) =>
      Effect.map(SynchronizedRef.get(registry), (current) => {
        const tableId = roomOf(current.rooms, playerId);
        return Option.fromNullable(
          tableId === undefined ? undefined : getRoom(current.rooms, tableId),
        );
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
      tableOf,
    } as const;
  }),
}) {}

export type { RouletteError };

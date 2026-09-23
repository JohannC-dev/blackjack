import { randomUUID } from "node:crypto";
import {
  Cause,
  Data,
  Effect,
  Exit,
  ManagedRuntime,
  Option,
  SynchronizedRef,
} from "effect";
import type { RoomVisibility } from "../src/lib/types";

export type RoomGame = "blackjack" | "roulette" | "tower" | "poker" | "chicken";
export type Room = {
  readonly id: string;
  readonly visibility: RoomVisibility;
  readonly members: ReadonlySet<string>;
};
export type RoomState = {
  readonly rooms: ReadonlyMap<string, Room>;
  readonly membership: ReadonlyMap<string, string>;
};
export type RoomChange<A> = { readonly value: A; readonly state: RoomState };

export class RoomError extends Data.TaggedError("RoomError")<{
  readonly message: string;
}> {}

export const emptyRoomState = (): RoomState => ({
  rooms: new Map(),
  membership: new Map(),
});

const change = <A>(value: A, state: RoomState): RoomChange<A> => ({
  value,
  state,
});
const snapshot = (room: Room): Room => ({
  ...room,
  members: new Set(room.members),
});

export function roomChannel(game: RoomGame, roomId: string) {
  return `${game}:${roomId}`;
}

export function getRoom(state: RoomState, id: string) {
  const room = state.rooms.get(id);
  return room && snapshot(room);
}

export function roomOf(state: RoomState, playerId: string) {
  return state.membership.get(playerId);
}

export function findPublicRoom(
  state: RoomState,
  available: (room: Room) => boolean,
) {
  for (const room of state.rooms.values()) {
    const view = snapshot(room);
    if (view.visibility === "public" && available(view)) return view;
  }
}

/** Pure transitions allow Roulette to commit its table and room in one step. */
export function createRoom(
  state: RoomState,
  visibility: RoomVisibility,
  makeId: () => string = randomUUID,
  requestedId?: string,
): Effect.Effect<RoomChange<Room>, RoomError> {
  return Effect.gen(function* () {
    const generateId = Effect.try({
      try: makeId,
      catch: () => new RoomError({ message: "Impossible de créer la salle." }),
    });
    let id = requestedId ?? (yield* generateId);
    if (!id)
      return yield* new RoomError({ message: "Code de salle invalide." });
    if (requestedId && state.rooms.has(id))
      return yield* new RoomError({ message: "Cette salle existe déjà." });
    for (let attempt = 0; state.rooms.has(id); attempt++) {
      if (attempt >= 32)
        return yield* new RoomError({
          message: "Impossible de créer la salle.",
        });
      id = yield* generateId;
    }
    const room: Room = { id, visibility, members: new Set() };
    return change(snapshot(room), {
      ...state,
      rooms: new Map(state.rooms).set(id, room),
    });
  });
}

export function privateRoom(
  state: RoomState,
  id: string,
): Effect.Effect<RoomChange<Room>, RoomError> {
  const existing = getRoom(state, id);
  if (!existing) return createRoom(state, "private", randomUUID, id);
  return existing.visibility === "private"
    ? Effect.succeed(change(existing, state))
    : Effect.fail(
        new RoomError({ message: "Ce code appartient à une salle publique." }),
      );
}

export function publicRoom(
  state: RoomState,
  available: (room: Room) => boolean,
  makeId: () => string = randomUUID,
): Effect.Effect<RoomChange<Room>, RoomError> {
  const existing = findPublicRoom(state, available);
  return existing
    ? Effect.succeed(change(existing, state))
    : createRoom(state, "public", makeId);
}

export function joinRoom(
  state: RoomState,
  playerId: string,
  roomId: string,
): Effect.Effect<RoomChange<void>, RoomError> {
  const room = state.rooms.get(roomId);
  if (!room)
    return Effect.fail(new RoomError({ message: "Cette salle n’existe pas." }));
  const previous = roomOf(state, playerId);
  if (previous === roomId) return Effect.succeed(change(undefined, state));
  const rooms = new Map(state.rooms);
  if (previous) {
    const oldRoom = rooms.get(previous);
    if (oldRoom)
      rooms.set(previous, {
        ...oldRoom,
        members: new Set([...oldRoom.members].filter((id) => id !== playerId)),
      });
  }
  rooms.set(roomId, {
    ...room,
    members: new Set([...room.members, playerId]),
  });
  return Effect.succeed(
    change(undefined, {
      rooms,
      membership: new Map(state.membership).set(playerId, roomId),
    }),
  );
}

export function enterPublicRoom(
  state: RoomState,
  playerId: string,
  available: (room: Room) => boolean,
  makeId: () => string = randomUUID,
): Effect.Effect<RoomChange<Room>, RoomError> {
  return Effect.gen(function* () {
    const selected = yield* publicRoom(state, available, makeId);
    const joined = yield* joinRoom(selected.state, playerId, selected.value.id);
    return change(selected.value, joined.state);
  });
}

export function leaveRoom(state: RoomState, playerId: string) {
  const roomId = roomOf(state, playerId);
  if (!roomId) return change(undefined, state);
  const rooms = new Map(state.rooms);
  const room = rooms.get(roomId);
  if (room)
    rooms.set(roomId, {
      ...room,
      members: new Set([...room.members].filter((id) => id !== playerId)),
    });
  const membership = new Map(state.membership);
  membership.delete(playerId);
  return change(roomId, { rooms, membership });
}

export function deleteEmptyRoom(state: RoomState, roomId: string) {
  const room = state.rooms.get(roomId);
  if (!room || room.members.size) return change(false, state);
  const rooms = new Map(state.rooms);
  rooms.delete(roomId);
  return change(true, { ...state, rooms });
}

/** Serializes room changes for games whose engines are synchronous. */
export class Rooms extends Effect.Service<Rooms>()("Rooms", {
  effect: Effect.gen(function* () {
    const ref = yield* SynchronizedRef.make(emptyRoomState());
    const modify = <A, E>(
      transition: (state: RoomState) => Effect.Effect<RoomChange<A>, E>,
    ) =>
      SynchronizedRef.modifyEffect(ref, (state) =>
        Effect.map(transition(state), ({ value, state: next }) => [
          value,
          next,
        ]),
      );
    return {
      get: (id: string) =>
        Effect.map(SynchronizedRef.get(ref), (s) => getRoom(s, id)),
      roomOf: (playerId: string) =>
        Effect.map(SynchronizedRef.get(ref), (s) => roomOf(s, playerId)),
      findPublic: (available: (room: Room) => boolean) =>
        Effect.map(SynchronizedRef.get(ref), (s) =>
          findPublicRoom(s, available),
        ),
      create: (
        visibility: RoomVisibility,
        makeId: () => string,
        requestedId?: string,
      ) => modify((s) => createRoom(s, visibility, makeId, requestedId)),
      privateRoom: (id: string) => modify((s) => privateRoom(s, id)),
      publicRoom: (available: (room: Room) => boolean, makeId: () => string) =>
        modify((s) => publicRoom(s, available, makeId)),
      enterPublic: (
        playerId: string,
        available: (room: Room) => boolean,
        makeId: () => string,
      ) => modify((s) => enterPublicRoom(s, playerId, available, makeId)),
      join: (playerId: string, roomId: string) =>
        modify((s) => joinRoom(s, playerId, roomId)),
      leave: (playerId: string) =>
        modify((s) => Effect.succeed(leaveRoom(s, playerId))),
      deleteEmpty: (roomId: string) =>
        modify((s) => Effect.succeed(deleteEmptyRoom(s, roomId))),
    } as const;
  }),
}) {}

/** Runs the Effect service at the synchronous game-engine boundary. */
export function makeRoomRuntime(
  game: RoomGame,
  makeId: () => string = randomUUID,
) {
  const runtime = ManagedRuntime.make(Rooms.Default);
  const run = <A, E>(operation: (rooms: Rooms) => Effect.Effect<A, E>): A => {
    const exit = runtime.runSyncExit(Effect.flatMap(Rooms, operation));
    if (Exit.isSuccess(exit)) return exit.value;
    const failure = Cause.failureOption(exit.cause);
    if (Option.isSome(failure)) throw failure.value;
    console.error(`Salles ${game} ·`, Cause.pretty(exit.cause));
    throw new Error(`Erreur du registre des salles ${game}.`);
  };
  return {
    get: (id: string) => run((rooms) => rooms.get(id)),
    roomOf: (playerId: string) => run((rooms) => rooms.roomOf(playerId)),
    findPublic: (available: (room: Room) => boolean) =>
      run((rooms) => rooms.findPublic(available)),
    create: (visibility: RoomVisibility, requestedId?: string) =>
      run((rooms) => rooms.create(visibility, makeId, requestedId)),
    privateRoom: (id: string) => run((rooms) => rooms.privateRoom(id)),
    publicRoom: (available: (room: Room) => boolean) =>
      run((rooms) => rooms.publicRoom(available, makeId)),
    enterPublic: (playerId: string, available: (room: Room) => boolean) =>
      run((rooms) => rooms.enterPublic(playerId, available, makeId)),
    join: (playerId: string, roomId: string) =>
      run((rooms) => rooms.join(playerId, roomId)),
    leave: (playerId: string) => run((rooms) => rooms.leave(playerId)),
    deleteEmpty: (roomId: string) => run((rooms) => rooms.deleteEmpty(roomId)),
    channel: (id: string) => roomChannel(game, id),
    dispose: () => runtime.dispose(),
  };
}

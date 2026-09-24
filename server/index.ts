import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { Server } from "socket.io";
import { Effect, Either, Exit, Option, Schema } from "effect";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { Table, type Player } from "./engine";
import { auth } from "./auth";
import { runDatabase } from "./db/client";
import {
  currentDeploymentVersion,
  publishDeploymentVersion,
} from "./db/version";
import {
  applyWalletOperations,
  getOrCreateWallet,
  readWallet,
} from "./db/wallet";
import { PokerManager } from "./poker";
import { makeRoomRuntime, roomChannel } from "./rooms";
import { TowerManager } from "./tower";
import { ChickenManager } from "./chicken";
import { MinesGame } from "./mines";
import { PlinkoGame } from "./plinko";
import { makeRouletteRuntime } from "./roulette";
import { RecordingGameWallet } from "./game-wallet";
import { refillWallet } from "./refill";
import { handleSocialRequest } from "./social/http";
import { areFriends, friendIdsOf } from "./social/repository";
import { handleReferralRequest } from "./referral/http";
import { handleCosmeticRequest } from "./cosmetics/http";
import { onReferralCompleted } from "./referral/events";
import { checkInDaily, spinDailyWheel } from "./daily/repository";
import {
  GameError,
  ServerClock,
  ServerClockLive,
  decodeInput,
  errorMessage,
  gameEffect,
  isFailure,
  runEffect,
  toGameError,
} from "./effect";
import {
  BlackjackCommandSchema,
  EmoteRequestSchema,
  FriendInviteReplySchema,
  FriendInviteSchema,
  JoinSchema,
  MinesCommandSchema,
  PlinkoCommandSchema,
  PokerCommandSchema,
  RouletteJoinSchema,
  TowerCommandSchema,
  ChickenCommandSchema,
  ChickenJoinSchema,
} from "./protocol";
import type {
  Ack,
  Command,
  MinesCommand,
  PlinkoCommand,
  PokerCommand,
  TowerCommand,
  ChickenCommand,
  Wallet,
} from "../src/lib/types";
import {
  EMOTE_BY_ID,
  type EmoteEvent,
  type EmoteRequest,
} from "../src/lib/emotes";
import type { GameInvite, GameInviteReply } from "../src/lib/social";
import {
  WHEEL_SPIN_MS,
  dayKeyAt,
  type DailySpin,
  type DailyUpdate,
} from "../src/lib/daily";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const app = next({ dev, hostname, port });
await Effect.runPromise(
  Effect.tryPromise({ try: () => app.prepare(), catch: toGameError }),
);
const handler = app.getRequestHandler();
const authHandler = toNodeHandler(auth);
const http = createServer(async (req, res) => {
  if (req.url?.startsWith("/api/auth/")) {
    await authHandler(req, res);
    return;
  }
  if (req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.url === "/api/version" && req.method === "GET") {
    try {
      const version = await currentDeploymentVersion();
      res.writeHead(200, {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(version));
    } catch {
      res.writeHead(503, { "Cache-Control": "no-store" });
      res.end();
    }
    return;
  }
  if (req.url === "/api/profile" && req.method === "GET") {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Non authentifié." }));
      return;
    }
    try {
      const wallet = await runDatabase(getOrCreateWallet(session.user.id));
      res.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          balance: wallet.balance,
        }),
      );
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Profil indisponible." }));
    }
    return;
  }
  if (
    await handleSocialRequest(req, res, {
      isOnline: (userId) => !!playerSockets.get(userId)?.size,
      notify: notifySocial,
    })
  )
    return;
  if (
    await handleReferralRequest(req, res, {
      isOnline: (userId) => !!playerSockets.get(userId)?.size,
    })
  )
    return;
  if (await handleCosmeticRequest(req, res)) return;
  handler(req, res);
});
const io = new Server(http, {
  maxHttpBufferSize: 16_384,
  // Next.js registers its own HMR upgrade handler on the first page request.
  destroyUpgrade: false,
  allowRequest: (req, done) => {
    // Socket.IO clients on the same origin, or non-browser clients used by the integration tests.
    const origin = req.headers.origin;
    try {
      done(null, !origin || new URL(origin).host === req.headers.host);
    } catch {
      done(null, false);
    }
  },
});
io.use(async (socket, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(socket.request.headers),
    });
    if (!session) {
      next(new Error("AUTH_REQUIRED"));
      return;
    }
    socket.data.session = session;
    next();
  } catch {
    next(new Error("AUTH_UNAVAILABLE"));
  }
});

const tables = new Map<string, Table>();
const blackjackRooms = makeRoomRuntime("blackjack", () =>
  randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(),
);
const profiles = new Map<string, Player>();
const playersById = new Map<string, Player>();
const gameWallet = new RecordingGameWallet();
const playerSockets = new Map<string, Set<string>>();
/** Last invitation sent from one player to another, to stop spamming. */
const lastInvites = new Map<string, number>();

function emitToPlayer(playerId: string, event: string, payload?: unknown) {
  for (const socketId of playerSockets.get(playerId) ?? [])
    io.to(socketId).emit(event, payload);
}

/** Friends and requests live in the database; clients refetch them. */
function notifySocial(userIds: readonly string[]) {
  for (const userId of new Set(userIds))
    emitToPlayer(userId, "friends:changed");
}

/**
 * A filleul just signed up with a parrainage code. A connected parrain sees
 * their new credits and their filleul straight away.
 */
onReferralCompleted((event) => {
  const parrain = playersById.get(event.parrainId);
  if (parrain)
    Effect.runPromise(refreshWalletEffect(parrain)).catch((error: unknown) =>
      console.error("Parrainage · portefeuille", error),
    );
  emitToPlayer(event.parrainId, "referral:filleul", {
    filleul: event.filleul,
    tiers: event.tiers,
  });
});

/** A player came online or left: their friends refresh their list. */
function notifyPresence(userId: string) {
  runDatabase(friendIdsOf(userId)).then(notifySocial, (error: unknown) =>
    console.error("Amis · présence", error),
  );
}
/** Last wallet pushed to each connected player. */
const wallets = new Map<string, Wallet>();
/** Sockets of each player currently showing the Tower. */
const towerSockets = new Map<string, Set<string>>();
const chickenSockets = new Map<string, Set<string>>();
type TowerSocketIntent = { kind: "join" | "leave"; version: number };
const towerSocketIntents = new Map<string, TowerSocketIntent>();

function markTowerSocketIntent(
  socketId: string,
  kind: TowerSocketIntent["kind"],
) {
  const intent = {
    kind,
    version: (towerSocketIntents.get(socketId)?.version ?? 0) + 1,
  } satisfies TowerSocketIntent;
  towerSocketIntents.set(socketId, intent);
  return intent;
}

function isCurrentTowerSocketIntent(
  socketId: string,
  intent: TowerSocketIntent,
) {
  const current = towerSocketIntents.get(socketId);
  return current?.version === intent.version && current.kind === intent.kind;
}
const mines = new Map<string, MinesGame>();
function publishMines(playerId: string) {
  const snapshot = mines.get(playerId)?.snapshot() ?? null;
  for (const socketId of playerSockets.get(playerId) ?? [])
    io.to(socketId).emit("mines:state", snapshot);
}
function getMines(playerId: string) {
  let game = mines.get(playerId);
  if (!game) {
    game = new MinesGame(() => publishMines(playerId), gameWallet);
    mines.set(playerId, game);
  }
  return game;
}

function getMinesEffect(playerId: string) {
  return gameEffect(() => getMines(playerId));
}
const plinko = new Map<string, PlinkoGame>();
function publishPlinko(playerId: string) {
  const snapshot = plinko.get(playerId)?.snapshot() ?? null;
  for (const socketId of playerSockets.get(playerId) ?? [])
    io.to(socketId).emit("plinko:state", snapshot);
}
function getPlinko(playerId: string) {
  let game = plinko.get(playerId);
  if (!game) {
    game = new PlinkoGame(gameWallet);
    plinko.set(playerId, game);
  }
  return game;
}

function getPlinkoEffect(playerId: string) {
  return gameEffect(() => getPlinko(playerId));
}
const rouletteRoom = (tableId: string) => roomChannel("roulette", tableId);
const blackjackRoom = (tableId: string) => blackjackRooms.channel(tableId);
/** Roulette owns its table pool and borrows only club players and sockets. */
const roulette = makeRouletteRuntime({
  players: {
    get: (playerId) =>
      Effect.sync(() => Option.fromNullable(playersById.get(playerId))),
  },
  wallet: gameWallet,
  transport: {
    publish: (state) =>
      Effect.sync(() => {
        io.to(rouletteRoom(state.id)).emit("roulette:state", state);
      }),
    enter: (socketIds, tableId) =>
      Effect.sync(() =>
        io.in([...socketIds]).socketsJoin(rouletteRoom(tableId)),
      ),
    exit: (socketIds, tableId) =>
      Effect.sync(() =>
        io.in([...socketIds]).socketsLeave(rouletteRoom(tableId)),
      ),
  },
});
const poker = new PokerManager((playerId, state) => {
  for (const socketId of playerSockets.get(playerId) ?? [])
    io.to(socketId).emit("poker:state", state);
}, gameWallet);
const tower = new TowerManager(
  (playerId, state) => {
    for (const socketId of towerSockets.get(playerId) ?? [])
      io.to(socketId).emit("tower:state", state);
  },
  // Public updates only reach the climbers sharing the room.
  (roomId, state) => io.to(roomId).emit("tower:feed", state),
  undefined,
  // Development only: TOWER_NO_TRAPS=1 bun run dev reaches the top every time.
  dev && process.env.TOWER_NO_TRAPS === "1",
  gameWallet,
);
const chicken = new ChickenManager(
  (playerId, state) => {
    for (const socketId of chickenSockets.get(playerId) ?? [])
      io.to(socketId).emit("chicken:state", state);
  },
  (channel, state) => io.to(channel).emit("chicken:feed", state),
  undefined,
  gameWallet,
);
// Development only: DAILY_UNLIMITED_SPINS=1 offers the wheel on every connection.
const dailyOptions = {
  unlimitedSpins: dev && process.env.DAILY_UNLIMITED_SPINS === "1",
};
if (dailyOptions.unlimitedSpins)
  console.log("Roue quotidienne · mode test, un tour à chaque connexion");
if (dev && process.env.TOWER_NO_TRAPS === "1")
  console.log("La Tower · mode test sans pièges activé");

function publicTableFor(playerId?: string) {
  const currentRoom = playerId ? blackjackRooms.roomOf(playerId) : undefined;
  if (currentRoom && blackjackRooms.get(currentRoom)?.visibility === "public")
    return currentRoom;
  return blackjackRooms.publicRoom((room) => {
    const table = tables.get(room.id);
    return (
      !table ||
      (table.state.phase === "betting" &&
        table.state.seats.some((seat) => seat.playerId === null))
    );
  }).id;
}

function getTable(id: string) {
  let table = tables.get(id);
  if (!table) {
    const room = blackjackRooms.get(id);
    if (!room) throw new Error("Cette salle n’existe pas.");
    table = new Table(
      id,
      () => io.to(blackjackRoom(id)).emit("state", tables.get(id)!.snapshot()),
      undefined,
      gameWallet,
      false,
      room.visibility,
    );
    tables.set(id, table);
  }
  return table;
}
/** Financial commands are serialized around one explicit wallet batch. */
let financialQueue: Promise<unknown> = Promise.resolve();

function serializeFinancial<A>(task: () => Promise<A>): Promise<A> {
  const result = financialQueue.then(task, task);
  financialQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function refreshWalletEffect(player: Player) {
  return Effect.tryPromise({
    try: async () => {
      const wallet = await runDatabase(readWallet(player.token));
      player.balance = wallet.balance;
      publishWallet(player.id);
    },
    catch: toGameError,
  });
}

function publishWallet(playerId: string, socketId?: string) {
  const player = playersById.get(playerId);
  if (!player) return;
  const previous = wallets.get(playerId);
  if (!previous || previous.balance !== player.balance) {
    const next = {
      balance: player.balance,
      seq: (previous?.seq ?? 0) + 1,
    } satisfies Wallet;
    wallets.set(playerId, next);
    for (const connectionId of playerSockets.get(playerId) ?? [])
      io.to(connectionId).emit("wallet", next);
    return;
  }
  if (socketId) io.to(socketId).emit("wallet", previous);
}

/** Runs a streak query, rejecting with its own error and message. */
async function runDaily<A, E>(effect: Parameters<typeof runDatabase<A, E>>[0]) {
  const result = await runDatabase(Effect.either(effect));
  if (Either.isLeft(result)) throw result.left;
  return result.right;
}

/**
 * Counts the club day of a connected player and tells their tabs. Runs in
 * the financial queue: a milestone credits the wallet outside a game batch.
 */
function syncDaily(playerId: string) {
  void serializeFinancial(async () => {
    const update: DailyUpdate = await runDaily(
      checkInDaily(playerId, Date.now(), dailyOptions),
    );
    const player = playersById.get(playerId);
    if (player && update.checkIn?.milestone)
      await Effect.runPromise(refreshWalletEffect(player));
    emitToPlayer(playerId, "daily:status", update);
  }).catch((error: unknown) => console.error("Série quotidienne", error));
}

/** Club day seen by the last maintenance tick, to notice 08:00. */
let dailyDay = dayKeyAt(Date.now());

function commitWalletOperationsEffect() {
  const operations = gameWallet.operations();
  const gameResults = gameWallet.gameResults();
  if (!operations.length && !gameResults.length) {
    gameWallet.complete();
    return Effect.void;
  }
  return Effect.tryPromise({
    try: () => runDatabase(applyWalletOperations(operations, gameResults)),
    catch: toGameError,
  }).pipe(
    Effect.tap((results) =>
      Effect.sync(() => {
        for (const result of results) {
          const player = playersById.get(result.userId);
          if (player) player.balance = result.balance;
        }
        gameWallet.complete();
        for (const result of results) publishWallet(result.userId);
      }),
    ),
    Effect.asVoid,
  );
}

function walletTransactionEffect<A, E>(effect: Effect.Effect<A, E, never>) {
  return Effect.acquireUseRelease(
    Effect.try({ try: () => gameWallet.begin(), catch: toGameError }),
    () => effect.pipe(Effect.tap(() => commitWalletOperationsEffect())),
    (_, exit) =>
      Exit.isFailure(exit)
        ? Effect.sync(() =>
            gameWallet.rollback((playerId) => playersById.get(playerId)),
          )
        : Effect.void,
  );
}

function detachTowerSocketEffect(socketId: string, player: Player) {
  return gameEffect(() => {
    const sockets = towerSockets.get(player.id);
    const roomId = tower.roomIdOf(player.id);
    if (!sockets?.delete(socketId)) {
      if (!roomId || sockets?.size) return false;
      io.in(socketId).socketsLeave(roomId);
      return true;
    }
    if (roomId) io.in(socketId).socketsLeave(roomId);
    if (sockets.size) return false;
    towerSockets.delete(player.id);
    return true;
  });
}

function leaveTowerEffect(socketId: string, player: Player, abandon: boolean) {
  return Effect.gen(function* () {
    const shouldLeave = yield* detachTowerSocketEffect(socketId, player);
    if (shouldLeave) yield* tower.leaveEffect(player, undefined, { abandon });
  });
}

function detachChickenSocket(socketId: string, player: Player) {
  const sockets = chickenSockets.get(player.id);
  const channel = chicken.roomIdOf(player.id);
  if (channel) io.in(socketId).socketsLeave(channel);
  if (!sockets?.delete(socketId)) return false;
  if (sockets.size) return false;
  chickenSockets.delete(player.id);
  return true;
}

function replyError(ack: unknown, error: unknown) {
  if (typeof ack === "function")
    ack({
      ok: false,
      error: errorMessage(error),
    } satisfies Ack);
}

async function executeReply<A, E, R>(
  ack: unknown,
  effect: Effect.Effect<A, E, never>,
  onSuccess: (value: A) => R,
  onFailure?: () => void,
) {
  const result = await Effect.runPromise(Effect.either(effect));
  if (isFailure(result)) {
    onFailure?.();
    replyError(ack, result.left);
  } else if (typeof ack === "function") ack(onSuccess(result.right));
}

function replyEffect<A, E, R = Ack>(
  ack: unknown,
  effect: Effect.Effect<A, E, never>,
  onSuccess: (value: A) => R = () => ({ ok: true }) as R,
) {
  void executeReply(ack, effect, onSuccess);
}

/**
 * `onSuccess` runs once the wallet transaction has committed, `onFailure`
 * once it has been rolled back: the place to publish or undo game state.
 */
function replyWalletEffect<A, E, R = Ack>(
  ack: unknown,
  effect: Effect.Effect<A, E, never>,
  onSuccess: (value: A) => R = () => ({ ok: true }) as R,
  onFailure?: () => void,
) {
  void serializeFinancial(() =>
    executeReply(ack, walletTransactionEffect(effect), onSuccess, onFailure),
  );
}

function runOrThrow<A, E>(effect: Effect.Effect<A, E, never>): A {
  const result = runEffect(effect);
  if (isFailure(result)) throw result.left;
  return result.right;
}

function inputEffect<A, B, E>(
  schema: Schema.Schema<A>,
  input: unknown,
  message: string,
  action: (value: A) => Effect.Effect<B, E, never>,
) {
  return Effect.gen(function* () {
    const value = yield* decodeInput(schema, input, message);
    return yield* action(value);
  });
}

io.on("connection", (socket) => {
  let player: Player | undefined;
  let dailySynced = false;
  /** Recent emote times, to keep the table readable. */
  let emoteTimes: number[] = [];
  let events = 0;
  let windowStart = 0;
  function throttle(now: number) {
    if (now - windowStart > 1000) {
      events = 0;
      windowStart = now;
    }
    if (++events > 30) throw new Error("Un instant… trop d’actions à la fois.");
  }
  socket.on("clock:sync", (ack: (value: { serverTime: number }) => void) => {
    replyEffect(
      ack,
      gameEffect((clock) => ({ serverTime: clock.now() })),
      (value) => value,
    );
  });
  socket.on("join", (data: unknown, ack: (value: Ack) => void) => {
    replyWalletEffect(
      ack,
      Effect.gen(function* () {
        const safeData = yield* decodeInput(
          JoinSchema,
          data,
          "La table demandée est invalide.",
        );
        const clock = yield* ServerClock;
        throttle(clock.now());
        const session = socket.data.session as
          { user: { id: string; name: string; email: string } } | undefined;
        if (!session)
          return yield* Effect.fail(new GameError("Session expirée."));

        const name = session.user.name
          .trim()
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .slice(0, 18);
        if (!name)
          return yield* Effect.fail(new GameError("Choisissez un pseudo."));
        if (player && player.token !== session.user.id)
          return yield* Effect.fail(
            new GameError("Reconnectez-vous pour changer de profil."),
          );

        const wallet = yield* Effect.tryPromise({
          try: () => runDatabase(getOrCreateWallet(session.user.id)),
          catch: toGameError,
        });
        let known = profiles.get(session.user.id);
        const tableId = safeData.createPrivate
          ? blackjackRooms.create("private").id
          : safeData.tableId
            ? // A friend's invitation may name a public table.
              blackjackRooms.get(safeData.tableId)?.visibility === "public"
              ? safeData.tableId
              : blackjackRooms.privateRoom(safeData.tableId).id
            : publicTableFor(known?.id);
        if (known && known.roomId !== tableId) {
          const connections = playerSockets.get(known.id);
          if (
            connections &&
            (connections.size > 1 ||
              (connections.size === 1 && !connections.has(socket.id)))
          )
            return yield* Effect.fail(
              new GameError(
                "Fermez votre autre onglet avant de changer de table.",
              ),
            );
          const oldTable = tables.get(known.roomId);
          if (oldTable) runOrThrow(oldTable.removeEffect(known.id));
          socket.leave(blackjackRoom(known.roomId));
          known.ready = false;
        }

        const table = getTable(tableId);
        if (!known) {
          known = {
            id: session.user.id,
            token: session.user.id,
            name,
            balance: wallet.balance,
            ready: false,
            connected: true,
            roomId: tableId,
            lastSeen: clock.now(),
          };
          profiles.set(session.user.id, known);
          playersById.set(known.id, known);
        }
        known.name = name;
        known.balance = wallet.balance;
        player = known;
        player.connected = true;
        player.lastSeen = clock.now();
        player.roomId = tableId;
        blackjackRooms.join(player.id, tableId);
        const connections = playerSockets.get(player.id) ?? new Set();
        const cameOnline = !connections.size;
        connections.add(socket.id);
        playerSockets.set(player.id, connections);
        if (cameOnline) notifyPresence(player.id);
        socket.join(blackjackRoom(tableId));
        runOrThrow(table.observeEffect(player));
        runOrThrow(poker.connectEffect(player));
        publishWallet(player.id, socket.id);
        publishMines(player.id);
        publishPlinko(player.id);
        return {
          ok: true,
          playerId: player.id,
          tableId,
        } satisfies Ack;
      }).pipe(Effect.provide(ServerClockLive)),
      (value) => {
        // Once per connection: changing table joins again.
        if (!dailySynced && player) {
          dailySynced = true;
          syncDaily(player.id);
        }
        return value;
      },
    );
  });
  socket.on("daily:spin", (ack: unknown) => {
    const currentPlayer = player;
    void serializeFinancial(async () => {
      if (!currentPlayer) throw new Error("Connectez-vous au club.");
      throttle(Date.now());
      const { spin, checkIn } = await runDaily(
        spinDailyWheel(currentPlayer.id, Date.now(), dailyOptions),
      );
      const wallet = await runDatabase(readWallet(currentPlayer.id));
      currentPlayer.balance = wallet.balance;
      return { spin, checkIn };
    }).then(
      ({ spin, checkIn }) => {
        if (typeof ack === "function")
          ack({ ok: true, spin } satisfies { ok: true; spin: DailySpin });
        // The new balance would give the prize away before the wheel stops.
        setTimeout(() => {
          publishWallet(currentPlayer!.id);
          emitToPlayer(currentPlayer!.id, "daily:status", {
            status: spin.status,
            checkIn,
          } satisfies DailyUpdate);
        }, WHEEL_SPIN_MS);
      },
      (error: unknown) => replyError(ack, error),
    );
  });
  socket.on("blackjack:join", (ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      Effect.gen(function* () {
        const currentPlayer = yield* gameEffect((clock) => {
          throttle(clock.now());
          if (!player) throw new Error("Vous n’êtes pas connecté à la table.");
          return player;
        });
        yield* tables.get(currentPlayer.roomId)!.addEffect(currentPlayer);
      }),
    );
  });
  socket.on("wallet:refill", (ack: (value: Ack) => void) => {
    replyWalletEffect(
      ack,
      Effect.gen(function* () {
        const currentPlayer = yield* gameEffect((clock) => {
          throttle(clock.now());
          if (!player) throw new Error("Vous n’êtes pas connecté au club.");
          return player;
        });
        yield* refreshWalletEffect(currentPlayer);
        yield* gameEffect(() => refillWallet(currentPlayer, gameWallet));
      }),
    );
  });
  socket.on("command", (command: unknown, ack: (value: Ack) => void) => {
    replyWalletEffect(
      ack,
      inputEffect(
        BlackjackCommandSchema,
        command,
        "Action invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const context = yield* gameEffect((clock) => {
              throttle(clock.now());
              if (!player)
                throw new Error("Vous n’êtes pas connecté à la table.");
              const blackjackTable = tables.get(player.roomId)!;
              const blackjackPlayerId = player.id;
              if (
                !blackjackTable.players.has(blackjackPlayerId) ||
                !blackjackTable.state.seats.some(
                  (seat) => seat.playerId === blackjackPlayerId,
                )
              )
                runOrThrow(blackjackTable.addEffect(player));
              return { blackjackTable, blackjackPlayerId };
            });
            yield* refreshWalletEffect(
              playersById.get(context.blackjackPlayerId)!,
            );
            yield* context.blackjackTable.commandEffect(
              context.blackjackPlayerId,
              parsed as Command,
            );
          }),
      ),
    );
  });
  socket.on("poker:command", (command: unknown, ack: (value: Ack) => void) => {
    replyWalletEffect(
      ack,
      inputEffect(
        PokerCommandSchema,
        command,
        "Action Poker invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const currentPlayer = yield* gameEffect((clock) => {
              throttle(clock.now());
              if (!player) throw new Error("Vous n’êtes pas connecté au club.");
              return player;
            });
            yield* refreshWalletEffect(currentPlayer);
            yield* poker.commandEffect(currentPlayer, parsed as PokerCommand);
            const blackjackTable = tables.get(currentPlayer.roomId);
            if (blackjackTable)
              io.to(blackjackRoom(currentPlayer.roomId)).emit(
                "state",
                blackjackTable.snapshot(),
              );
          }),
      ),
    );
  });
  socket.on("tower:command", (command: unknown, ack: (value: Ack) => void) => {
    replyWalletEffect(
      ack,
      inputEffect(
        TowerCommandSchema,
        command,
        "Action Tower invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const currentPlayer = yield* gameEffect((clock) => {
              throttle(clock.now());
              if (!player) throw new Error("Vous n’êtes pas connecté au club.");
              return player;
            });
            yield* refreshWalletEffect(currentPlayer);
            yield* tower.commandEffect(currentPlayer, parsed as TowerCommand);
          }),
      ),
    );
  });
  socket.on(
    "chicken:command",
    (command: unknown, ack: (value: Ack) => void) => {
      replyWalletEffect(
        ack,
        inputEffect(
          ChickenCommandSchema,
          command,
          "Action Chicken invalide.",
          (parsed) =>
            Effect.gen(function* () {
              const currentPlayer = yield* gameEffect((clock) => {
                throttle(clock.now());
                if (!player) throw new Error("Connectez-vous au club.");
                return player;
              });
              yield* refreshWalletEffect(currentPlayer);
              yield* chicken.commandEffect(
                currentPlayer,
                parsed as ChickenCommand,
              );
            }),
        ),
      );
    },
  );
  socket.on("mines:command", (command: unknown, ack: (value: Ack) => void) => {
    replyWalletEffect(
      ack,
      inputEffect(
        MinesCommandSchema,
        command,
        "Action Mines invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const currentPlayer = yield* gameEffect((clock) => {
              throttle(clock.now());
              if (!player) throw new Error("Vous n’êtes pas connecté au club.");
              return player;
            });
            yield* refreshWalletEffect(currentPlayer);
            const minesGame = yield* getMinesEffect(currentPlayer.id);
            yield* minesGame.commandEffect(
              currentPlayer,
              parsed as MinesCommand,
            );
          }),
      ),
    );
  });
  socket.on("plinko:command", (command: unknown, ack: (value: Ack) => void) => {
    // The balls reach the board only once their wallet entries are committed.
    let restore: (() => void) | undefined;
    replyWalletEffect(
      ack,
      inputEffect(
        PlinkoCommandSchema,
        command,
        "Action Plinko invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const currentPlayer = yield* gameEffect((clock) => {
              throttle(clock.now());
              if (!player) throw new Error("Vous n’êtes pas connecté au club.");
              return player;
            });
            yield* refreshWalletEffect(currentPlayer);
            const plinkoGame = yield* getPlinkoEffect(currentPlayer.id);
            restore = plinkoGame.checkpoint();
            yield* plinkoGame.commandEffect(
              currentPlayer,
              parsed as PlinkoCommand,
            );
            return currentPlayer.id;
          }),
      ),
      (playerId) => {
        publishPlinko(playerId);
        return { ok: true };
      },
      () => restore?.(),
    );
  });
  socket.on(
    "roulette:command",
    (command: unknown, ack: (value: Ack) => void) => {
      replyWalletEffect(
        ack,
        Effect.gen(function* () {
          const currentPlayer = yield* gameEffect((clock) => {
            throttle(clock.now());
            if (!player) throw new Error("Connectez-vous au club.");
            return player;
          });
          yield* refreshWalletEffect(currentPlayer);
          yield* gameEffect(() => {
            roulette.run((runtime) =>
              runtime.command(socket.id, currentPlayer.id, command),
            );
          });
        }),
      );
    },
  );
  socket.on("roulette:join", (data: unknown, ack?: (value: Ack) => void) => {
    // The table is optional: `emit("roulette:join", ack)` stays valid.
    if (typeof data === "function") {
      ack = data as (value: Ack) => void;
      data = {};
    }
    replyEffect(
      ack,
      inputEffect(
        RouletteJoinSchema,
        data ?? {},
        "La table demandée est invalide.",
        (safeData) =>
          gameEffect((clock) => {
            throttle(clock.now());
            const currentPlayer = player;
            if (!currentPlayer) throw new Error("Connectez-vous au club.");
            roulette.run((r) =>
              r.join(
                socket.id,
                currentPlayer.id,
                safeData.tableId ?? undefined,
              ),
            );
          }),
      ),
    );
  });
  socket.on("roulette:leave", (ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      gameEffect((clock) => {
        throttle(clock.now());
        const currentPlayer = player;
        if (!currentPlayer) throw new Error("Connectez-vous au club.");
        roulette.run((r) => r.leave(socket.id, currentPlayer.id));
      }),
    );
  });
  socket.on("tower:join", (ack: (value: Ack) => void) => {
    const intent = markTowerSocketIntent(socket.id, "join");
    replyEffect(
      ack,
      gameEffect((clock) => {
        throttle(clock.now());
        if (!isCurrentTowerSocketIntent(socket.id, intent)) return;
        if (!player) throw new Error("Vous n’êtes pas connecté au club.");
        const sockets = towerSockets.get(player.id) ?? new Set();
        sockets.add(socket.id);
        towerSockets.set(player.id, sockets);
        socket.join(runOrThrow(tower.enterEffect(player)));
      }),
    );
  });
  // Leaving the Tower view settles the climb: nothing stays at risk while the
  // player is in another game.
  socket.on("tower:leave", (ack: (value: Ack) => void) => {
    const intent = markTowerSocketIntent(socket.id, "leave");
    replyWalletEffect(
      ack,
      Effect.gen(function* () {
        const isCurrentLeave = yield* gameEffect(() =>
          isCurrentTowerSocketIntent(socket.id, intent),
        );
        if (!isCurrentLeave) return;
        const currentPlayer = yield* gameEffect((clock) => {
          throttle(clock.now());
          if (!player) throw new Error("Vous n’êtes pas connecté au club.");
          return player;
        });
        const shouldLeave = yield* detachTowerSocketEffect(
          socket.id,
          currentPlayer,
        );
        yield* refreshWalletEffect(currentPlayer);
        if (shouldLeave) {
          const stillAbsent = yield* gameEffect(
            () =>
              isCurrentTowerSocketIntent(socket.id, intent) &&
              !towerSockets.get(currentPlayer.id)?.size,
          );
          if (stillAbsent)
            yield* tower.leaveEffect(currentPlayer, undefined, {
              abandon: true,
            });
        }
      }),
    );
  });
  socket.on("chicken:join", (data: unknown, ack?: (value: Ack) => void) => {
    if (typeof data === "function") {
      ack = data as (value: Ack) => void;
      data = {};
    }
    replyWalletEffect(
      ack,
      inputEffect(
        ChickenJoinSchema,
        data ?? {},
        "Salon Chicken invalide.",
        (options) =>
          Effect.gen(function* () {
            const currentPlayer = yield* gameEffect((clock) => {
              throttle(clock.now());
              if (!player) throw new Error("Connectez-vous au club.");
              return player;
            });
            yield* refreshWalletEffect(currentPlayer);
            const previous = chicken.roomIdOf(currentPlayer.id);
            const target = yield* chicken.enterEffect(currentPlayer, options);
            yield* gameEffect(() => {
              const sockets =
                chickenSockets.get(currentPlayer.id) ?? new Set<string>();
              sockets.add(socket.id);
              chickenSockets.set(currentPlayer.id, sockets);
              for (const socketId of sockets) {
                if (previous && previous !== target.channel)
                  io.in(socketId).socketsLeave(previous);
                io.in(socketId).socketsJoin(target.channel);
              }
              chicken.refresh(currentPlayer);
            });
            return target.roomId;
          }),
      ),
      (roomId) => ({ ok: true, tableId: roomId }),
    );
  });
  socket.on("chicken:leave", (ack: (value: Ack) => void) => {
    replyWalletEffect(
      ack,
      Effect.gen(function* () {
        const currentPlayer = yield* gameEffect((clock) => {
          throttle(clock.now());
          if (!player) throw new Error("Connectez-vous au club.");
          return player;
        });
        yield* refreshWalletEffect(currentPlayer);
        const last = yield* gameEffect(() =>
          detachChickenSocket(socket.id, currentPlayer),
        );
        if (last) yield* chicken.leaveEffect(currentPlayer);
      }),
    );
  });
  // Game invitations are relayed live between friends and never stored.
  socket.on("friends:invite", (data: unknown, ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      inputEffect(FriendInviteSchema, data, "Invitation invalide.", (request) =>
        Effect.gen(function* () {
          const { sender, now } = yield* gameEffect((clock) => {
            throttle(clock.now());
            if (!player) throw new Error("Connectez-vous au club.");
            return { sender: player, now: clock.now() };
          });
          const tableId = request.tableId ?? null;
          let isPrivate = false;
          if (request.game === "blackjack") {
            if (!tableId || tableId !== sender.roomId)
              return yield* Effect.fail(
                new GameError("Rejoignez d’abord cette table de Blackjack."),
              );
            isPrivate = blackjackRooms.get(tableId)?.visibility === "private";
          } else if (request.game === "roulette") {
            const room = Option.getOrUndefined(
              roulette.run((r) => r.tableOf(sender.id)),
            );
            if (!tableId || room?.id !== tableId)
              return yield* Effect.fail(
                new GameError("Rejoignez d’abord cette table de Roulette."),
              );
            isPrivate = room.visibility === "private";
          } else if (request.game === "chicken") {
            const room = chicken.roomOf(sender.id);
            if (!tableId || !room || room.id !== tableId)
              return yield* Effect.fail(
                new GameError("Rejoignez d’abord votre route Chicken."),
              );
            isPrivate = room.visibility === "private";
          } else if (tableId)
            return yield* Effect.fail(
              new GameError("Ce jeu ne se joue pas à une table."),
            );
          const friendly = yield* Effect.tryPromise({
            try: () => runDatabase(areFriends(sender.id, request.friendId)),
            catch: toGameError,
          });
          if (!friendly)
            return yield* Effect.fail(
              new GameError("Vous ne pouvez inviter que vos amis."),
            );
          if (!playerSockets.get(request.friendId)?.size)
            return yield* Effect.fail(
              new GameError("Votre ami n’est pas connecté."),
            );
          const key = sender.id + ":" + request.friendId;
          if (now - (lastInvites.get(key) ?? 0) < 5000)
            return yield* Effect.fail(
              new GameError("Invitation déjà envoyée, patientez un instant."),
            );
          if (request.game === "chicken" && tableId)
            yield* gameEffect(() =>
              chicken.invite(sender.id, request.friendId, tableId, now),
            );
          lastInvites.set(key, now);
          emitToPlayer(request.friendId, "friends:invite", {
            id: randomUUID(),
            from: { id: sender.id, name: sender.name },
            game: request.game,
            tableId,
            private: isPrivate,
            sentAt: now,
          } satisfies GameInvite);
        }),
      ),
    );
  });
  socket.on(
    "friends:invite:reply",
    (data: unknown, ack?: (value: Ack) => void) => {
      replyEffect(
        ack,
        inputEffect(
          FriendInviteReplySchema,
          data,
          "Réponse invalide.",
          (reply) =>
            Effect.gen(function* () {
              const responder = yield* gameEffect((clock) => {
                throttle(clock.now());
                if (!player) throw new Error("Connectez-vous au club.");
                return player;
              });
              const friendly = yield* Effect.tryPromise({
                try: () => runDatabase(areFriends(responder.id, reply.toId)),
                catch: toGameError,
              });
              if (!friendly) return;
              emitToPlayer(reply.toId, "friends:invite:reply", {
                inviteId: reply.inviteId,
                by: { id: responder.id, name: responder.name },
                accepted: reply.accepted,
              } satisfies GameInviteReply);
            }),
        ),
      );
    },
  );
  // Emotes are cosmetic: relayed to the table, never stored.
  socket.on("emote", (request: unknown) => {
    runEffect(
      inputEffect(
        EmoteRequestSchema,
        request,
        "Emote invalide.",
        (safeRequest) =>
          gameEffect((clock) => {
            throttle(clock.now());
            if (!player) return;
            const definition = EMOTE_BY_ID.get(safeRequest.emote);
            if (!definition) return;
            const now = clock.now();
            emoteTimes = emoteTimes.filter((time) => now - time < 10_000);
            if (
              emoteTimes.length >= 5 ||
              now - (emoteTimes[emoteTimes.length - 1] ?? 0) < 700
            )
              return;
            let recipients: string[];
            if (safeRequest.game === "blackjack") {
              const seated = new Set(
                tables
                  .get(player.roomId)
                  ?.state.seats.map((seat) => seat.playerId)
                  .filter((id): id is string => !!id),
              );
              if (!seated.has(player.id)) return;
              recipients = [...seated];
            } else if (safeRequest.game === "poker") {
              recipients = poker.tableMatesOf(player.id);
              if (!recipients.includes(player.id)) return;
            } else return;
            const targetId =
              definition.kind === "throw" &&
              typeof safeRequest.targetId === "string" &&
              safeRequest.targetId !== player.id &&
              recipients.includes(safeRequest.targetId)
                ? safeRequest.targetId
                : undefined;
            if (definition.kind === "throw" && !targetId) return;
            emoteTimes.push(now);
            const event: EmoteEvent = {
              id: randomUUID(),
              game: safeRequest.game,
              emote: definition.id,
              fromId: player.id,
              fromName: player.name,
              targetId,
            };
            if (safeRequest.game === "blackjack")
              io.to(blackjackRoom(player.roomId)).emit("emote", event);
            else
              for (const playerId of recipients)
                for (const socketId of playerSockets.get(playerId) ?? [])
                  io.to(socketId).emit("emote", event);
          }),
      ),
    );
  });
  socket.on("disconnect", () => {
    if (!player) return;
    // A dropped connection keeps the climb for a while so a reload resumes it.
    const disconnectedPlayer = player;
    runOrThrow(
      Effect.gen(function* () {
        yield* leaveTowerEffect(socket.id, disconnectedPlayer, false);
        const lastChickenSocket = yield* gameEffect(() =>
          detachChickenSocket(socket.id, disconnectedPlayer),
        );
        if (lastChickenSocket)
          yield* chicken.leaveEffect(disconnectedPlayer, true);
        yield* gameEffect(() => towerSocketIntents.delete(socket.id));
        yield* gameEffect(() => {
          roulette.run((r) => r.disconnect(socket.id, disconnectedPlayer.id));
        });
        const shouldDisconnect = yield* gameEffect((clock) => {
          const connections = playerSockets.get(disconnectedPlayer.id);
          connections?.delete(socket.id);
          if (connections?.size) return false;
          playerSockets.delete(disconnectedPlayer.id);
          disconnectedPlayer.connected = false;
          disconnectedPlayer.lastSeen = clock.now();
          return true;
        });
        if (!shouldDisconnect) return;
        yield* gameEffect(() => notifyPresence(disconnectedPlayer.id));
        yield* poker.disconnectEffect(disconnectedPlayer);
        yield* gameEffect(() => {
          if (tables.get(disconnectedPlayer.roomId)?.state.phase === "betting")
            disconnectedPlayer.ready = false;
          io.to(blackjackRoom(disconnectedPlayer.roomId)).emit(
            "state",
            tables.get(disconnectedPlayer.roomId)?.snapshot(),
          );
        });
      }),
    );
  });
});
const maintenanceEffect = Effect.provide(
  Effect.gen(function* () {
    const clock = yield* ServerClock;
    const now = clock.now();
    for (const [id, table] of tables) {
      yield* Effect.either(walletTransactionEffect(table.tickEffect(now)));
      for (const memberId of blackjackRooms.get(id)?.members ?? [])
        if (!table.players.has(memberId)) blackjackRooms.leave(memberId);
      if (!table.players.size && now - table.lastUsed > 30 * 60_000) {
        tables.delete(id);
        blackjackRooms.deleteEmpty(id);
      }
    }
    yield* Effect.either(walletTransactionEffect(poker.tickEffect(now)));
    yield* Effect.either(
      walletTransactionEffect(gameEffect(() => roulette.run((r) => r.tick))),
    );
    yield* Effect.either(walletTransactionEffect(tower.tickEffect(now)));
    yield* Effect.either(walletTransactionEffect(chicken.tickEffect(now)));
    for (const [token, profile] of profiles)
      if (!profile.connected && now - profile.lastSeen > 24 * 60 * 60_000) {
        yield* Effect.either(
          gameEffect(() => roulette.run((r) => r.forget(profile.id))),
        );
        yield* Effect.either(tower.forgetEffect(profile.id));
        yield* Effect.either(chicken.forgetEffect(profile.id));
        yield* Effect.either(
          gameEffect(() => {
            profiles.delete(token);
            blackjackRooms.leave(profile.id);
            blackjackRooms.deleteEmpty(profile.roomId);
            wallets.delete(profile.id);
            playersById.delete(profile.id);
            mines.delete(profile.id);
            plinko.delete(profile.id);
          }),
        );
      }
  }),
  ServerClockLive,
);
const listenEffect = Effect.async<void, GameError>((resume) => {
  http.once("error", (error) => resume(Effect.fail(toGameError(error))));
  http.listen(port, hostname, () => resume(Effect.succeed(undefined)));
});
await Effect.runPromise(listenEffect);
if (!dev) await publishDeploymentVersion();
console.log(
  `MINUIT · http://localhost:${port} · ${dev ? "development" : "production"}`,
);
const maintenanceTimer = setInterval(() => {
  // 08:00 in Paris: players already connected start the new day too.
  const today = dayKeyAt(Date.now());
  if (today !== dailyDay) {
    dailyDay = today;
    for (const playerId of playerSockets.keys()) syncDaily(playerId);
  }
  void serializeFinancial(() => Effect.runPromise(maintenanceEffect));
}, 100);
maintenanceTimer.unref();

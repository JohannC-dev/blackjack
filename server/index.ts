import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { Server } from "socket.io";
import { Effect, Schema } from "effect";
import { Table, type Player } from "./engine";
import { PokerManager } from "./poker";
import { TowerManager } from "./tower";
import { MinesGame } from "./mines";
import {
  decodeInput,
  errorMessage,
  gameEffect,
  isFailure,
  runEffect,
} from "./effect";
import {
  BlackjackCommandSchema,
  EmoteRequestSchema,
  JoinSchema,
  MinesCommandSchema,
  PokerCommandSchema,
  TowerCommandSchema,
} from "./protocol";
import type {
  Ack,
  Command,
  MinesCommand,
  PokerCommand,
  Profile,
  TowerCommand,
  Wallet,
} from "../src/lib/types";
import {
  EMOTE_BY_ID,
  type EmoteEvent,
  type EmoteRequest,
} from "../src/lib/emotes";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const app = next({ dev, hostname, port });
await app.prepare();
const handler = app.getRequestHandler();
const http = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
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
const tables = new Map<string, Table>();
const profiles = new Map<string, Player>();
const playersById = new Map<string, Player>();
const playerSockets = new Map<string, Set<string>>();
/** Connected players by id, for the wallet updates. */
const online = new Map<string, Player>();
/** Last wallet pushed to each connected player. */
const wallets = new Map<string, Wallet>();
/** Sockets of each player currently showing the Tower. */
const towerSockets = new Map<string, Set<string>>();
const mines = new Map<string, MinesGame>();
function publishMines(playerId: string) {
  const snapshot = mines.get(playerId)?.snapshot() ?? null;
  for (const socketId of playerSockets.get(playerId) ?? [])
    io.to(socketId).emit("mines:state", snapshot);
}
function getMines(playerId: string) {
  let game = mines.get(playerId);
  if (!game) {
    game = new MinesGame(() => publishMines(playerId));
    mines.set(playerId, game);
  }
  return game;
}
const poker = new PokerManager((playerId, state) => {
  for (const socketId of playerSockets.get(playerId) ?? [])
    io.to(socketId).emit("poker:state", state);
});
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
);
if (dev && process.env.TOWER_NO_TRAPS === "1")
  console.log("La Tower · mode test sans pièges activé");

function getTable(id: string) {
  let table = tables.get(id);
  if (!table) {
    if (tables.size >= 200)
      throw new Error("Toutes les tables sont occupées. Réessayez plus tard.");
    table = new Table(id, () =>
      io.to(id).emit("state", tables.get(id)!.snapshot()),
    );
    tables.set(id, table);
  }
  return table;
}
/**
 * The balance is shared by the three games but only the wallet event carries
 * it to the client. It is pushed after every command and every tick, from the
 * server's current value, so snapshots of different games can no longer
 * overwrite each other with an older balance.
 */
function syncWallets() {
  for (const [playerId, player] of online) {
    const wallet = wallets.get(playerId);
    if (wallet?.balance === player.balance) continue;
    const next = { balance: player.balance, seq: (wallet?.seq ?? 0) + 1 };
    wallets.set(playerId, next);
    for (const socketId of playerSockets.get(playerId) ?? [])
      io.to(socketId).emit("wallet", next);
  }
}
function leaveTower(socketId: string, player: Player, abandon: boolean) {
  const sockets = towerSockets.get(player.id);
  if (!sockets?.delete(socketId)) return;
  const roomId = tower.roomIdOf(player.id);
  if (roomId) io.in(socketId).socketsLeave(roomId);
  if (sockets.size) return;
  towerSockets.delete(player.id);
  tower.leave(player, Date.now(), { abandon });
}
function replyError(ack: unknown, error: unknown) {
  if (typeof ack === "function")
    ack({
      ok: false,
      error: errorMessage(error),
    } satisfies Ack);
}

function replyEffect<A>(
  ack: unknown,
  effect: Effect.Effect<A, any, never>,
  onSuccess: (value: A) => Ack = () => ({ ok: true }),
) {
  const result = runEffect(effect);
  if (isFailure(result)) replyError(ack, result.left);
  else if (typeof ack === "function") ack(onSuccess(result.right));
}

function inputEffect<A, B>(
  schema: Schema.Schema<A>,
  input: unknown,
  message: string,
  action: (value: A) => Effect.Effect<B, any, never>,
) {
  return Effect.gen(function* () {
    const value = yield* decodeInput(schema, input, message);
    return yield* action(value);
  });
}

io.on("connection", (socket) => {
  let player: Player | undefined;
  /** Recent emote times, to keep the table readable. */
  let emoteTimes: number[] = [];
  let events = 0;
  let windowStart = Date.now();
  function throttle() {
    if (Date.now() - windowStart > 1000) {
      events = 0;
      windowStart = Date.now();
    }
    if (++events > 30) throw new Error("Un instant… trop d’actions à la fois.");
  }
  socket.on("clock:sync", (ack: (value: { serverTime: number }) => void) => {
    if (typeof ack === "function") ack({ serverTime: Date.now() });
  });
  socket.on("join", (data: unknown, ack: (value: Ack) => void) => {
    const decoded = runEffect(
      decodeInput(JoinSchema, data, "Le profil est invalide."),
    );
    if (isFailure(decoded)) {
      replyError(ack, decoded.left);
      return;
    }
    const safeData = decoded.right;
    replyEffect(
      ack,
      gameEffect(() => {
        throttle();
        const profile = safeData.profile;
        const name = profile.name
          .trim()
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .slice(0, 18);
        if (!name) throw new Error("Choisissez un pseudo.");
        if (player && player.token !== profile.token)
          throw new Error("Reconnectez-vous pour changer de profil.");

        let known = profiles.get(profile.token);
        if (known && known.roomId !== safeData.tableId) {
          const connections = playerSockets.get(known.id);
          if (
            connections &&
            (connections.size > 1 ||
              (connections.size === 1 && !connections.has(socket.id)))
          )
            throw new Error(
              "Fermez votre autre onglet avant de changer de table.",
            );
          tables.get(known.roomId)?.remove(known.id);
          socket.leave(known.roomId);
          known.ready = false;
        }

        const table = getTable(safeData.tableId);
        if (!known) {
          const balance = Math.min(
            1_000_000,
            Math.round(profile.balance * 2) / 2,
          );
          known = {
            id: randomUUID(),
            token: profile.token,
            name,
            balance,
            ready: false,
            connected: true,
            roomId: safeData.tableId,
            lastSeen: Date.now(),
          };
          profiles.set(profile.token, known);
          playersById.set(known.id, known);
        }
        player = known;
        player.connected = true;
        player.lastSeen = Date.now();
        player.roomId = safeData.tableId;
        const connections = playerSockets.get(player.id) ?? new Set();
        connections.add(socket.id);
        playerSockets.set(player.id, connections);
        online.set(player.id, player);
        socket.join(safeData.tableId);
        // The shared socket is also used by Poker. Joining the room only adds
        // a Blackjack spectator; the Blackjack view explicitly reserves a
        // seat below.
        table.observe(player);
        poker.connect(player);
        const wallet = wallets.get(player.id);
        syncWallets();
        if (wallet && wallets.get(player.id) === wallet)
          socket.emit("wallet", wallet);
        publishMines(player.id);
        return {
          ok: true,
          playerId: player.id,
          tableId: safeData.tableId,
        } satisfies Ack;
      }),
      (value) => value,
    );
  });
  socket.on("blackjack:join", (ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      gameEffect(() => {
        throttle();
        if (!player) throw new Error("Vous n’êtes pas connecté à la table.");
        tables.get(player.roomId)!.add(player);
      }),
    );
  });
  socket.on("command", (command: unknown, ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      inputEffect(
        BlackjackCommandSchema,
        command,
        "Action invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const context = yield* gameEffect(() => {
              throttle();
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
                blackjackTable.add(player);
              return { blackjackTable, blackjackPlayerId };
            });
            yield* context.blackjackTable.commandEffect(
              context.blackjackPlayerId,
              parsed as Command,
            );
            yield* gameEffect(() => syncWallets());
          }),
      ),
    );
  });
  socket.on("poker:command", (command: unknown, ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      inputEffect(
        PokerCommandSchema,
        command,
        "Action Poker invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const currentPlayer = yield* gameEffect(() => {
              throttle();
              if (!player) throw new Error("Vous n’êtes pas connecté au club.");
              return player;
            });
            yield* poker.commandEffect(currentPlayer, parsed as PokerCommand);
            const blackjackTable = tables.get(currentPlayer.roomId);
            if (blackjackTable)
              io.to(currentPlayer.roomId).emit(
                "state",
                blackjackTable.snapshot(),
              );
            yield* gameEffect(() => syncWallets());
          }),
      ),
    );
  });
  socket.on("tower:command", (command: unknown, ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      inputEffect(
        TowerCommandSchema,
        command,
        "Action Tower invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const currentPlayer = yield* gameEffect(() => {
              throttle();
              if (!player) throw new Error("Vous n’êtes pas connecté au club.");
              return player;
            });
            yield* tower.commandEffect(currentPlayer, parsed as TowerCommand);
            yield* gameEffect(() => syncWallets());
          }),
      ),
    );
  });
  socket.on("mines:command", (command: unknown, ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      inputEffect(
        MinesCommandSchema,
        command,
        "Action Mines invalide.",
        (parsed) =>
          Effect.gen(function* () {
            const currentPlayer = yield* gameEffect(() => {
              throttle();
              if (!player) throw new Error("Vous n’êtes pas connecté au club.");
              return player;
            });
            yield* getMines(currentPlayer.id).commandEffect(
              currentPlayer,
              parsed as MinesCommand,
            );
            yield* gameEffect(() => syncWallets());
          }),
      ),
    );
  });
  socket.on("tower:join", (ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      gameEffect(() => {
        throttle();
        if (!player) throw new Error("Vous n’êtes pas connecté au club.");
        const sockets = towerSockets.get(player.id) ?? new Set();
        sockets.add(socket.id);
        towerSockets.set(player.id, sockets);
        socket.join(tower.enter(player));
      }),
    );
  });
  // Leaving the Tower view settles the climb: nothing stays at risk while the
  // player is in another game.
  socket.on("tower:leave", (ack: (value: Ack) => void) => {
    replyEffect(
      ack,
      gameEffect(() => {
        throttle();
        if (!player) throw new Error("Vous n’êtes pas connecté au club.");
        leaveTower(socket.id, player, true);
        syncWallets();
      }),
    );
  });
  // Emotes are cosmetic: relayed to the table, never stored.
  socket.on("emote", (request: unknown) => {
    runEffect(
      inputEffect(
        EmoteRequestSchema,
        request,
        "Emote invalide.",
        (safeRequest) =>
          gameEffect(() => {
            throttle();
            if (!player) return;
            const definition = EMOTE_BY_ID.get(safeRequest.emote);
            if (!definition) return;
            const now = Date.now();
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
              io.to(player.roomId).emit("emote", event);
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
    leaveTower(socket.id, player, false);
    const connections = playerSockets.get(player.id);
    connections?.delete(socket.id);
    if (!connections?.size) {
      playerSockets.delete(player.id);
      online.delete(player.id);
      player.connected = false;
      player.lastSeen = Date.now();
      poker.disconnect(player);
      if (tables.get(player.roomId)?.state.phase === "betting")
        player.ready = false;
      io.to(player.roomId).emit("state", tables.get(player.roomId)?.snapshot());
    }
  });
});
setInterval(() => {
  const now = Date.now();
  for (const [id, table] of tables) {
    runEffect(table.tickEffect(now));
    if (!table.players.size && now - table.lastUsed > 30 * 60_000)
      tables.delete(id);
  }
  runEffect(poker.tickEffect(now));
  runEffect(tower.tickEffect(now));
  runEffect(gameEffect(() => syncWallets()));
  for (const [token, player] of profiles)
    if (!player.connected && now - player.lastSeen > 24 * 60 * 60_000) {
      profiles.delete(token);
      tower.forget(player.id);
      wallets.delete(player.id);
      playersById.delete(player.id);
      mines.delete(player.id);
    }
}, 100).unref();
http.listen(port, hostname, () =>
  console.log(
    `MINUIT · http://localhost:${port} · ${dev ? "development" : "production"}`,
  ),
);

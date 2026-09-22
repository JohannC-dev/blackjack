import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { Server } from "socket.io";
import { Table, type Player } from "./engine";
import { PokerManager } from "./poker";
import { TowerManager } from "./tower";
import { MinesGame } from "./mines";
import { Effect, Option } from "effect";
import { InsufficientCredits, makeRouletteRuntime } from "./roulette";
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
const rouletteRoom = (tableId: string) => `roulette:${tableId}`;
/** The Roulette runs on Effect; the club only lends it its players and sockets. */
const roulette = makeRouletteRuntime({
  players: {
    get: (playerId) =>
      Effect.sync(() => Option.fromNullable(playersById.get(playerId))),
    debit: (playerId, amount) =>
      Effect.suspend(() => {
        const player = playersById.get(playerId);
        if (!player || player.balance < amount)
          return Effect.fail(new InsufficientCredits());
        player.balance -= amount;
        return Effect.void;
      }),
    credit: (playerId, amount) =>
      Effect.sync(() => {
        const player = playersById.get(playerId);
        if (player) player.balance += amount;
      }),
  },
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
      error:
        error instanceof Error ? error.message : "Une erreur est survenue.",
    } satisfies Ack);
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
  socket.on(
    "join",
    (
      data: { profile: Profile; tableId: string },
      ack: (value: Ack) => void,
    ) => {
      try {
        throttle();
        const profile = data?.profile;
        if (
          !profile ||
          typeof profile.token !== "string" ||
          !/^[a-f0-9-]{36}$/i.test(profile.token) ||
          typeof profile.name !== "string"
        )
          throw new Error("Le profil est invalide.");
        const name = profile.name
          .trim()
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .slice(0, 18);
        if (!name) throw new Error("Choisissez un pseudo.");
        if (
          typeof data.tableId !== "string" ||
          !/^[A-Z0-9]{4,12}$/.test(data.tableId)
        )
          throw new Error("Le code de table est invalide.");
        if (player && player.token !== profile.token)
          throw new Error("Reconnectez-vous pour changer de profil.");
        let known = profiles.get(profile.token);
        if (known && known.roomId !== data.tableId) {
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
        const table = getTable(data.tableId);
        if (!known) {
          // Local credits are deliberately user-controlled: this is a play-money game without a database.
          const balance =
            typeof profile.balance === "number" &&
            Number.isFinite(profile.balance) &&
            profile.balance >= 0
              ? Math.min(1_000_000, Math.round(profile.balance * 2) / 2)
              : 2000;
          known = {
            id: randomUUID(),
            token: profile.token,
            name,
            balance,
            ready: false,
            connected: true,
            roomId: data.tableId,
            lastSeen: Date.now(),
          };
          profiles.set(profile.token, known);
          playersById.set(known.id, known);
        }
        player = known;
        player.connected = true;
        player.lastSeen = Date.now();
        player.roomId = data.tableId;
        const connections = playerSockets.get(player.id) ?? new Set();
        connections.add(socket.id);
        playerSockets.set(player.id, connections);
        online.set(player.id, player);
        socket.join(data.tableId);
        if (typeof ack === "function")
          ack({ ok: true, playerId: player.id, tableId: data.tableId });
        // The shared socket is also used by Poker. Joining the room only adds
        // a Blackjack spectator; the Blackjack view explicitly reserves a
        // seat below.
        table.observe(player);
        poker.connect(player);
        // A new or changed wallet reaches every socket of the player; an
        // unchanged one is only resent to this new connection.
        const wallet = wallets.get(player.id);
        syncWallets();
        if (wallet && wallets.get(player.id) === wallet)
          socket.emit("wallet", wallet);
        publishMines(player.id);
      } catch (error) {
        replyError(ack, error);
      }
    },
  );
  socket.on("blackjack:join", (ack: (value: Ack) => void) => {
    try {
      throttle();
      if (!player) throw new Error("Vous n’êtes pas connecté à la table.");
      tables.get(player.roomId)!.add(player);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      replyError(ack, error);
    }
  });
  socket.on("command", (command: Command, ack: (value: Ack) => void) => {
    try {
      throttle();
      if (!player) throw new Error("Vous n’êtes pas connecté à la table.");
      const blackjackTable = tables.get(player.roomId)!;
      const blackjackPlayerId = player.id;
      // Keep the command endpoint backwards-compatible for non-browser
      // clients: an actual Blackjack action is also an explicit table entry.
      if (
        !blackjackTable.players.has(blackjackPlayerId) ||
        !blackjackTable.state.seats.some(
          (seat) => seat.playerId === blackjackPlayerId,
        )
      )
        blackjackTable.add(player);
      blackjackTable.command(blackjackPlayerId, command);
      syncWallets();
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      replyError(ack, error);
    }
  });
  socket.on(
    "poker:command",
    (command: PokerCommand, ack: (value: Ack) => void) => {
      try {
        throttle();
        if (!player) throw new Error("Vous n’êtes pas connecté au club.");
        poker.command(player, command);
        const blackjackTable = tables.get(player.roomId);
        if (blackjackTable)
          io.to(player.roomId).emit("state", blackjackTable.snapshot());
        syncWallets();
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        replyError(ack, error);
      }
    },
  );
  socket.on(
    "tower:command",
    (command: TowerCommand, ack: (value: Ack) => void) => {
      try {
        throttle();
        if (!player) throw new Error("Vous n’êtes pas connecté au club.");
        tower.command(player, command);
        syncWallets();
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        replyError(ack, error);
      }
    },
  );
  socket.on(
    "mines:command",
    (command: MinesCommand, ack: (value: Ack) => void) => {
      try {
        throttle();
        if (!player) throw new Error("Vous n’êtes pas connecté au club.");
        getMines(player.id).command(player, command);
        syncWallets();
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        replyError(ack, error);
      }
    },
  );
  socket.on(
    "roulette:command",
    (command: unknown, ack: (value: Ack) => void) => {
      try {
        throttle();
        if (!player) throw new Error("Vous n’êtes pas connecté au club.");
        const playerId = player.id;
        roulette.run((r) => r.command(socket.id, playerId, command));
        syncWallets();
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        replyError(ack, error);
      }
    },
  );
  socket.on("roulette:join", (ack: (value: Ack) => void) => {
    try {
      throttle();
      if (!player) throw new Error("Vous n’êtes pas connecté au club.");
      const { id, roomId } = player;
      roulette.run((r) => r.join(socket.id, id, roomId));
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      replyError(ack, error);
    }
  });
  socket.on("roulette:leave", (ack: (value: Ack) => void) => {
    try {
      throttle();
      if (!player) throw new Error("Vous n’êtes pas connecté au club.");
      const playerId = player.id;
      roulette.run((r) => r.leave(socket.id, playerId));
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      replyError(ack, error);
    }
  });
  socket.on("tower:join", (ack: (value: Ack) => void) => {
    try {
      throttle();
      if (!player) throw new Error("Vous n’êtes pas connecté au club.");
      const sockets = towerSockets.get(player.id) ?? new Set();
      sockets.add(socket.id);
      towerSockets.set(player.id, sockets);
      socket.join(tower.enter(player));
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      replyError(ack, error);
    }
  });
  // Leaving the Tower view settles the climb: nothing stays at risk while the
  // player is in another game.
  socket.on("tower:leave", (ack: (value: Ack) => void) => {
    try {
      throttle();
      if (!player) throw new Error("Vous n’êtes pas connecté au club.");
      leaveTower(socket.id, player, true);
      syncWallets();
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      replyError(ack, error);
    }
  });
  // Emotes are cosmetic: relayed to the table, never stored.
  socket.on("emote", (request: EmoteRequest) => {
    try {
      throttle();
      if (!player || !request || typeof request !== "object") return;
      const definition = EMOTE_BY_ID.get(request.emote);
      if (!definition) return;
      const now = Date.now();
      emoteTimes = emoteTimes.filter((time) => now - time < 10_000);
      if (
        emoteTimes.length >= 5 ||
        now - (emoteTimes[emoteTimes.length - 1] ?? 0) < 700
      )
        return;
      let recipients: string[];
      if (request.game === "blackjack") {
        const seated = new Set(
          tables
            .get(player.roomId)
            ?.state.seats.map((seat) => seat.playerId)
            .filter((id): id is string => !!id),
        );
        if (!seated.has(player.id)) return;
        recipients = [...seated];
      } else if (request.game === "poker") {
        recipients = poker.tableMatesOf(player.id);
        if (!recipients.includes(player.id)) return;
      } else return;
      const targetId =
        definition.kind === "throw" &&
        typeof request.targetId === "string" &&
        request.targetId !== player.id &&
        recipients.includes(request.targetId)
          ? request.targetId
          : undefined;
      if (definition.kind === "throw" && !targetId) return;
      emoteTimes.push(now);
      const event: EmoteEvent = {
        id: randomUUID(),
        game: request.game,
        emote: definition.id,
        fromId: player.id,
        fromName: player.name,
        targetId,
      };
      if (request.game === "blackjack")
        io.to(player.roomId).emit("emote", event);
      else
        for (const playerId of recipients)
          for (const socketId of playerSockets.get(playerId) ?? [])
            io.to(socketId).emit("emote", event);
    } catch {
      /* Dropped silently: an emote is never worth an error message. */
    }
  });
  socket.on("disconnect", () => {
    if (!player) return;
    // A dropped connection keeps the climb for a while so a reload resumes it.
    leaveTower(socket.id, player, false);
    // The seat stays a minute so a reload finds its chips again.
    const playerId = player.id;
    roulette.run((r) => r.disconnect(socket.id, playerId));
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
    table.tick(now);
    if (!table.players.size && now - table.lastUsed > 30 * 60_000)
      tables.delete(id);
  }
  poker.tick(now);
  roulette.run((r) => r.tick);
  tower.tick(now);
  syncWallets();
  for (const [token, player] of profiles)
    if (!player.connected && now - player.lastSeen > 24 * 60 * 60_000) {
      profiles.delete(token);
      tower.forget(player.id);
      wallets.delete(player.id);
      playersById.delete(player.id);
      mines.delete(player.id);
      roulette.run((r) => r.forget(player.id));
    }
}, 100).unref();
http.listen(port, hostname, () =>
  console.log(
    `MINUIT · http://localhost:${port} · ${dev ? "development" : "production"}`,
  ),
);

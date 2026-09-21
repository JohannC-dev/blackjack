import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { Server } from "socket.io";
import { Table, type Player } from "./engine";
import { PokerManager } from "./poker";
import type { Ack, Command, PokerCommand, Profile } from "../src/lib/types";

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
const playerSockets = new Map<string, Set<string>>();
const poker = new PokerManager((playerId, state) => {
  for (const socketId of playerSockets.get(playerId) ?? [])
    io.to(socketId).emit("poker:state", state);
});

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
        }
        player = known;
        player.connected = true;
        player.lastSeen = Date.now();
        player.roomId = data.tableId;
        const connections = playerSockets.get(player.id) ?? new Set();
        connections.add(socket.id);
        playerSockets.set(player.id, connections);
        socket.join(data.tableId);
        if (typeof ack === "function")
          ack({ ok: true, playerId: player.id, tableId: data.tableId });
        // The shared socket is also used by Poker. Joining the room only adds
        // a Blackjack spectator; the Blackjack view explicitly reserves a
        // seat below.
        table.observe(player);
        poker.connect(player);
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
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        replyError(ack, error);
      }
    },
  );
  socket.on("disconnect", () => {
    if (!player) return;
    const connections = playerSockets.get(player.id);
    connections?.delete(socket.id);
    if (!connections?.size) {
      playerSockets.delete(player.id);
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
  for (const [token, player] of profiles)
    if (!player.connected && now - player.lastSeen > 24 * 60 * 60_000)
      profiles.delete(token);
}, 100).unref();
http.listen(port, hostname, () =>
  console.log(
    `MINUIT · http://localhost:${port} · ${dev ? "development" : "production"}`,
  ),
);

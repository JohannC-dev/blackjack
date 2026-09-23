import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
import { createTestSession, socketAuth } from "./auth-session";
import type { Ack, PokerClientState, PokerCommand } from "../src/lib/types";

const url = process.env.TEST_URL ?? "http://localhost:3000";
type Client = { socket: Socket; id: string; poker?: PokerClientState };
const clients: Client[] = [];

async function until(check: () => boolean, message: string, timeout = 20_000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error(message);
    await Bun.sleep(40);
  }
}

async function connect(name: string) {
  const session = await createTestSession(url, name);
  const socket = io(url, socketAuth(session, url));
  const client: Client = { socket, id: "" };
  clients.push(client);
  socket.on("poker:state", (state: PokerClientState) => (client.poker = state));
  await until(() => socket.connected, `${name} ne se connecte pas`);
  const ack: Ack = await socket
    .timeout(5_000)
    .emitWithAck("join", { tableId: "SPINTEST" });
  assert(ack.ok);
  client.id = ack.playerId!;
  return client;
}

async function command(client: Client, command: PokerCommand) {
  const ack: Ack = await client.socket
    .timeout(5_000)
    .emitWithAck("poker:command", command);
  assert(ack.ok, JSON.stringify(ack));
}

try {
  const players = await Promise.all([
    connect("Nina"),
    connect("Léon"),
    connect("Maya"),
  ]);
  for (const player of players)
    await command(player, { type: "match", mode: "spin", stake: 200 });
  await until(
    () => players.every((player) => player.poker?.table?.phase === "spinning"),
    "La roue Spin ne démarre pas",
  );
  const multiplier = players[0].poker!.table!.wheelMultiplier!;
  assert([2, 3, 5, 10, 25, 100, 1_000].includes(multiplier));
  assert(players.every((player) => player.poker!.balance === 1_800));
  await until(
    () => players.every((player) => player.poker?.table?.phase === "preflop"),
    "La première main Spin ne démarre pas après la roue",
    10_000,
  );

  let guard = 0;
  while (players[0].poker?.table?.phase !== "complete" && guard < 50) {
    const table = players[0].poker?.table;
    if (
      !table ||
      !table.activePlayerId ||
      !["preflop", "flop", "turn", "river"].includes(table.phase)
    ) {
      await Bun.sleep(100);
      continue;
    }
    guard++;
    const active = players.find(
      (player) => player.id === table.activePlayerId,
    )!;
    const seat = table.seats.find((entry) => entry.id === active.id)!;
    await command(active, {
      type: "action",
      action: table.currentBet > seat.bet ? "call" : "all-in",
    });
    await Bun.sleep(50);
  }
  await until(
    () => players.every((player) => player.poker?.table?.phase === "complete"),
    "Le Spin ne se termine pas",
    20_000,
  );
  const winner = players.find(
    (player) => player.poker!.balance === 1_800 + 200 * multiplier,
  );
  assert(winner, "Le prix de la roue n’a pas été versé au vainqueur");
  assert(players[0].poker!.table!.history.length >= 1);
  console.log(
    `PASS: Spin & Play à trois joueurs, roue ×${multiplier}, all-ins, éliminations et prix versé.`,
  );
} finally {
  clients.forEach((client) => client.socket.disconnect());
}

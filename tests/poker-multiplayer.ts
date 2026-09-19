import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import type { Ack, PokerClientState, PokerCommand } from "../src/lib/types";

const url = process.env.TEST_URL ?? "http://localhost:3000";
type Client = {
  socket: Socket;
  id: string;
  token: string;
  poker?: PokerClientState;
};
const sockets: Socket[] = [];

async function until(check: () => boolean, message: string, timeout = 15_000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error(message);
    await Bun.sleep(40);
  }
}

async function connect(name: string, token = randomUUID()): Promise<Client> {
  const socket = io(url, { transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  const client: Client = { socket, id: "", token };
  socket.on("poker:state", (state: PokerClientState) => (client.poker = state));
  await until(() => socket.connected, `${name} ne se connecte pas`);
  const ack: Ack = await socket.timeout(5_000).emitWithAck("join", {
    tableId: "POKERTEST",
    profile: { token, name, balance: 10_000 },
  });
  assert(ack.ok);
  client.id = ack.playerId!;
  await until(() => !!client.poker, `${name} ne reçoit pas l’état Poker`);
  return client;
}

async function command(client: Client, action: PokerCommand, expected = true) {
  const ack: Ack = await client.socket
    .timeout(5_000)
    .emitWithAck("poker:command", action);
  assert.equal(ack.ok, expected, JSON.stringify(ack));
}

try {
  const alice = await connect("Alice");
  const bob = await connect("Bob");
  await command(alice, {
    type: "match",
    mode: "cash",
    stake: 20,
    buyIn: 2_000,
  });
  await command(bob, { type: "match", mode: "cash", stake: 20, buyIn: 2_000 });
  await until(
    () =>
      alice.poker?.table?.phase === "preflop" &&
      bob.poker?.table?.phase === "preflop",
    "La main cash ne démarre pas",
  );
  assert.equal(alice.poker!.balance, 8_000);
  assert.equal(bob.poker!.balance, 8_000);
  assert.equal(alice.poker!.table!.id, bob.poker!.table!.id);

  const aliceViewOfBob = alice.poker!.table!.seats.find(
    (seat) => seat.id === bob.id,
  )!;
  const bobViewOfAlice = bob.poker!.table!.seats.find(
    (seat) => seat.id === alice.id,
  )!;
  assert(aliceViewOfBob.cards.every((card) => card.hidden && card.rank === 0));
  assert(bobViewOfAlice.cards.every((card) => card.hidden && card.rank === 0));

  await command(alice, { type: "chat", text: "Bonne chance !" });
  await until(
    () =>
      bob.poker?.table?.chat.some(
        (message) => message.text === "Bonne chance !",
      ) ?? false,
    "Le chat ne se synchronise pas",
  );

  let guard = 0;
  while (alice.poker?.table?.phase !== "showdown" && guard++ < 20) {
    const table = alice.poker!.table!;
    const active = table.activePlayerId === alice.id ? alice : bob;
    const seat = table.seats.find(
      (entry) => entry.id === table.activePlayerId,
    )!;
    const toCall = table.currentBet - seat.bet;
    await command(active, {
      type: "action",
      action: toCall > 0 ? "call" : "check",
    });
    await until(
      () =>
        alice.poker?.table?.phase === "showdown" ||
        alice.poker?.table?.phase !== table.phase ||
        alice.poker?.table?.activePlayerId !== table.activePlayerId,
      "L’action Poker ne fait pas avancer la main",
    );
  }
  assert.equal(alice.poker!.table!.phase, "showdown");
  assert.equal(alice.poker!.table!.community.length, 5);
  assert.equal(alice.poker!.table!.history.length, 1);
  assert(
    alice.poker!.table!.seats.every((seat) =>
      seat.cards.every((card) => !card.hidden),
    ),
    "Le showdown doit révéler toutes les mains actives",
  );
  console.log(
    "PASS: matchmaking cash, portefeuille, confidentialité, chat et main Hold’em complète à deux clients.",
  );
} finally {
  sockets.forEach((socket) => socket.disconnect());
}

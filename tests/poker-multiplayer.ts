import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
import { createTestSession, socketAuth } from "./auth-session";
import type { Ack, PokerClientState, PokerCommand } from "../src/lib/types";

const url = process.env.TEST_URL ?? "http://localhost:3000";
type Client = {
  socket: Socket;
  id: string;
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

async function connect(name: string): Promise<Client> {
  const session = await createTestSession(url, name);
  const socket = io(url, socketAuth(session, url));
  sockets.push(socket);
  const client: Client = { socket, id: "" };
  socket.on("poker:state", (state: PokerClientState) => (client.poker = state));
  await until(() => socket.connected, `${name} ne se connecte pas`);
  const ack: Ack = await socket
    .timeout(5_000)
    .emitWithAck("join", { tableId: "POKERTEST" });
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
  assert.equal(alice.poker!.balance, 0);
  assert.equal(bob.poker!.balance, 0);
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
    if (!table.activePlayerId) {
      await until(
        () =>
          alice.poker?.table?.phase === "showdown" ||
          !!alice.poker?.table?.activePlayerId,
        "Le croupier ne distribue pas la street suivante",
      );
      continue;
    }
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
  await command(alice, { type: "leave" });
  await until(
    () =>
      alice.poker?.status === "lobby" &&
      !bob.poker?.table?.seats.some((seat) => seat.id === alice.id),
    "Quitter doit renvoyer au lobby et retirer le siège chez les adversaires",
  );
  console.log(
    "PASS: matchmaking cash, portefeuille, confidentialité, chat, showdown et départ synchronisé.",
  );
} finally {
  sockets.forEach((socket) => socket.disconnect());
}

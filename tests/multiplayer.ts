import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import type { Ack, Command, TableState, Wallet } from "../src/lib/types";

const url = process.env.TEST_URL ?? "http://localhost:3000";
const room = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
type Client = {
  socket: Socket;
  id: string;
  token: string;
  state?: TableState;
  wallet?: Wallet;
};
const sockets: Socket[] = [];
async function until(check: () => boolean, message: string, timeout = 20000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(message);
    await Bun.sleep(80);
  }
}
async function connect(
  name: string,
  token: string = randomUUID(),
  balance = 2000,
): Promise<Client> {
  const socket = io(url, { transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  const client: Client = { socket, id: "", token };
  socket.on("state", (state: TableState) => {
    client.state = state;
  });
  socket.on("wallet", (wallet: Wallet) => {
    client.wallet = wallet;
  });
  await until(() => socket.connected, "WebSocket did not connect");
  const ack: Ack = await socket
    .timeout(5000)
    .emitWithAck("join", { tableId: room, profile: { token, name, balance } });
  assert(ack.ok);
  client.id = ack.playerId!;
  await until(() => !!client.state, "No initial snapshot");
  return client;
}
async function command(client: Client, action: Command, success = true) {
  const ack: Ack = await client.socket
    .timeout(5000)
    .emitWithAck("command", action);
  assert.equal(ack.ok, success, JSON.stringify(ack));
}
try {
  const alice = await connect("Alice test");
  const bob = await connect("Bob test");
  await until(() => alice.state?.players.length === 2, "Players did not sync");
  await command(alice, { type: "claim", seat: 3 });
  await command(alice, {
    type: "bet",
    seat: 3,
    bet: { main: 25, three: 0, pairs: 0 },
  });
  await command(bob, {
    type: "bet",
    seat: 1,
    bet: { main: 25, three: 0, pairs: 0 },
  });
  await command(alice, {
    type: "bet",
    seat: 2,
    bet: { main: 25, three: 5, pairs: 5 },
  });
  await command(bob, { type: "release", seat: 2 }, false);
  await command(alice, { type: "ready", ready: true });
  await command(bob, { type: "ready", ready: true });
  await until(
    () => ["playing", "dealer"].includes(alice.state?.phase ?? ""),
    "No round started",
  );
  assert.equal(
    alice.state!.dealer.length,
    1,
    "European blackjack must only deal one initial dealer card",
  );
  assert.equal(alice.state!.seats.filter((s) => s.hands.length).length, 3);
  const savedId = alice.id;
  const savedToken = alice.token;
  alice.socket.disconnect();
  const rejoined = await connect("Alice test", savedToken, 999999);
  assert.equal(rejoined.id, savedId);
  const bonuses = rejoined
    .state!.seats.filter((s) => s.playerId === savedId)
    .reduce(
      (sum, s) =>
        sum + (s.sides.three?.payout ?? 0) + (s.sides.pairs?.payout ?? 0),
      0,
    );
  assert.equal(
    rejoined.state!.players.find((p) => p.id === savedId)!.balance,
    1940 + bonuses,
    "Reconnect must not trust a changed local balance; side bets are already paid",
  );
  let guard = 0;
  while (rejoined.state?.phase === "playing" && guard++ < 24) {
    const state = rejoined.state!;
    const seat = state.seats.find((s) =>
      s.hands.some((h) => h.id === state.activeHandId),
    )!;
    const owner = seat.playerId === rejoined.id ? rejoined : bob;
    const previous = state.activeHandId;
    await command(owner, { type: "stand", handId: previous! });
    await until(
      () => rejoined.state?.activeHandId !== previous,
      "Turn did not advance",
    );
  }
  await until(
    () => rejoined.state?.phase === "settled" && bob.state?.phase === "settled",
    "Round did not settle",
  );
  assert.deepEqual(
    rejoined.state,
    bob.state,
    "Both clients must see the exact same settled table",
  );
  for (const client of [rejoined, bob]) {
    const state = client.state!;
    const me = state.players.find((p) => p.id === client.id)!;
    assert.equal(
      me.balance,
      2000 + state.history.find((h) => h.playerId === client.id)!.net,
    );
    assert(
      !JSON.stringify(state).includes(client.token),
      "Snapshots must not expose authentication tokens",
    );
  }
  await until(() => bob.state?.phase === "betting", "Betting did not reopen");
  const lowBalance = await connect("Recave test", randomUUID(), 4_500);
  await until(
    () => lowBalance.wallet?.balance === 4_500,
    "Initial wallet missing",
  );
  const refill: Ack = await lowBalance.socket
    .timeout(5000)
    .emitWithAck("wallet:refill");
  assert.equal(refill.ok, true);
  await until(
    () => lowBalance.wallet?.balance === 10_000,
    "Recave did not replace the balance",
  );
  const repeated: Ack = await lowBalance.socket
    .timeout(5000)
    .emitWithAck("wallet:refill");
  assert.equal(repeated.ok, false, "Recave must be refused at 10 000");
  const threshold = await connect("Seuil test", randomUUID(), 5_000);
  const atThreshold: Ack = await threshold.socket
    .timeout(5000)
    .emitWithAck("wallet:refill");
  assert.equal(atThreshold.ok, false, "Recave must be refused at 5 000");
  console.log(
    "PASS: two real WebSocket clients, three seats, side bets, ownership checks, reconnect, accounting, synchronized settlement, next round and shared-wallet recave.",
  );
} finally {
  sockets.forEach((socket) => socket.disconnect());
}

import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
import {
  createTestSession,
  socketAuth,
  type TestSession,
} from "./auth-session";
import type {
  Ack,
  RouletteCommand,
  RouletteTableState,
  Wallet,
} from "../src/lib/types";

const url = process.env.TEST_URL ?? "http://localhost:3000";
const tableId = `ROUL${Math.floor(Math.random() * 1e5)}`;
type Client = {
  socket: Socket;
  id: string;
  wallets: Wallet[];
  roulette?: RouletteTableState;
};
const clients: Client[] = [];

async function until(check: () => boolean, message: string, timeout = 20_000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error(message);
    await Bun.sleep(40);
  }
}

async function connect(name: string, existingSession?: TestSession) {
  const session = existingSession ?? (await createTestSession(url, name));
  const socket = io(url, socketAuth(session, url));
  const client: Client = { socket, id: "", wallets: [] };
  clients.push(client);
  socket.on("wallet", (wallet: Wallet) => client.wallets.push(wallet));
  socket.on(
    "roulette:state",
    (state: RouletteTableState) => (client.roulette = state),
  );
  await until(() => socket.connected, `${name} ne se connecte pas`);
  const ack: Ack = await socket.timeout(5_000).emitWithAck("join", { tableId });
  assert(ack.ok, `${name} ne rejoint pas le club`);
  client.id = ack.playerId!;
  return client;
}

const emit = async (client: Client, event: string, payload?: unknown) =>
  (await (payload === undefined
    ? client.socket.timeout(5_000).emitWithAck(event)
    : client.socket.timeout(5_000).emitWithAck(event, payload))) as Ack;
const command = (client: Client, payload: RouletteCommand | unknown) =>
  emit(client, "roulette:command", payload);
const balanceOf = (client: Client) => client.wallets.at(-1)?.balance;

try {
  const aliceSession = await createTestSession(url, "Alice");
  const alice = await connect("Alice", aliceSession);
  const bob = await connect("Bob");
  await until(
    () => balanceOf(alice) !== undefined && balanceOf(bob) !== undefined,
    "les portefeuilles n’arrivent pas",
  );
  const start = { alice: balanceOf(alice)!, bob: balanceOf(bob)! };

  // A connection that has not opened the Roulette cannot bet.
  const refused = await command(alice, { type: "repeat" });
  assert(!refused.ok && refused.error === "Ouvrez la roulette pour jouer.");

  assert((await emit(alice, "roulette:join")).ok);
  assert((await emit(bob, "roulette:join")).ok);
  await until(
    () =>
      alice.roulette?.players.length === 2 &&
      bob.roulette?.players.length === 2,
    "les deux joueurs ne sont pas assis à la même table",
  );
  assert.equal(alice.roulette!.id, tableId);

  // Another tab of Alice left on another game is refused too.
  const otherTab = await connect("Alice", aliceSession);
  const otherTabAck = await command(otherTab, { type: "repeat" });
  assert(
    !otherTabAck.ok && otherTabAck.error === "Ouvrez la roulette pour jouer.",
  );
  otherTab.socket.disconnect();

  // Malformed payloads are refused with a readable message.
  for (const [payload, error] of [
    [null, "Action invalide."],
    [{ type: "tricher" }, "Action Roulette inconnue."],
    [{ type: "bets", bets: "tout" }, "Les mises sont invalides."],
    [
      {
        type: "bets",
        bets: [{ kind: "straight", selection: "37", amount: 5 }],
      },
      "Une des mises n’est pas valide.",
    ],
  ] as const) {
    const ack = await command(alice, payload);
    assert(
      !ack.ok && ack.error === error,
      `${JSON.stringify(payload)} accepté`,
    );
  }

  assert(
    (
      await command(alice, {
        type: "bets",
        bets: [{ kind: "color", selection: "red", amount: 50 }],
      })
    ).ok,
  );
  assert(
    (
      await command(bob, {
        type: "bets",
        bets: [{ kind: "color", selection: "black", amount: 50 }],
      })
    ).ok,
  );
  await until(
    () =>
      bob.roulette?.players.find((p) => p.id === alice.id)?.bets.length === 1,
    "Bob ne voit pas les jetons d’Alice",
  );
  assert((await command(alice, { type: "ready", ready: true })).ok);
  assert((await command(bob, { type: "ready", ready: true })).ok);

  await until(
    () => alice.roulette?.phase === "spinning",
    "la bille ne part pas",
  );
  const number = alice.roulette!.number!;
  assert.equal(bob.roulette?.number ?? number, number);
  await until(
    () => balanceOf(alice) === start.alice - 50,
    "la mise d’Alice n’est pas débitée",
  );
  assert.equal(balanceOf(bob), start.bob - 50);

  await until(
    () => alice.roulette?.phase === "settled",
    "la bille ne tombe pas",
  );
  const results = alice.roulette!.results;
  assert.equal(results.length, 2);
  await until(
    () =>
      balanceOf(alice) ===
        start.alice + results.find((r) => r.playerId === alice.id)!.net &&
      balanceOf(bob) ===
        start.bob + results.find((r) => r.playerId === bob.id)!.net,
    "les gains ne sont pas versés",
  );
  // Red and black: the zero takes both stakes, otherwise one wins the other.
  const total = results.reduce((sum, r) => sum + r.net, 0);
  assert.equal(total, number === 0 ? -100 : 0);

  // Leaving after being paid frees the seat when the next round opens.
  assert((await emit(bob, "roulette:leave")).ok);
  await until(
    () =>
      alice.roulette?.phase === "betting" &&
      alice.roulette.players.length === 1,
    "Bob reste assis",
  );
  console.log(`Roulette multijoueur OK · numéro ${number}`);
} finally {
  for (const client of clients) client.socket.disconnect();
}

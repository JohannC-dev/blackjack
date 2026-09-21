import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  TowerClientState,
  TowerCommand,
  TowerPublicState,
  Wallet,
} from "../src/lib/types";

// Run against a server started with TOWER_NO_TRAPS=1 so every card is safe.
const url = process.env.TEST_URL ?? "http://localhost:3000";
type Client = {
  socket: Socket;
  id: string;
  wallets: Wallet[];
  tower?: TowerClientState;
  feeds: TowerPublicState[];
};
const clients: Client[] = [];

async function until(check: () => boolean, message: string, timeout = 10_000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error(message);
    await Bun.sleep(40);
  }
}

async function connect(name: string) {
  const socket = io(url, { transports: ["websocket"], reconnection: false });
  const client: Client = { socket, id: "", wallets: [], feeds: [] };
  clients.push(client);
  socket.on("wallet", (wallet: Wallet) => client.wallets.push(wallet));
  socket.on("tower:state", (state: TowerClientState) => (client.tower = state));
  socket.on("tower:feed", (state: TowerPublicState) =>
    client.feeds.push(state),
  );
  await until(() => socket.connected, `${name} ne se connecte pas`);
  const ack: Ack = await socket.timeout(5_000).emitWithAck("join", {
    tableId: "TOWERTEST",
    profile: { token: randomUUID(), name, balance: 10_000 },
  });
  assert(ack.ok);
  client.id = ack.playerId!;
  return client;
}

async function emit(client: Client, event: string, payload?: TowerCommand) {
  const socket = client.socket.timeout(5_000);
  return (await (payload === undefined
    ? socket.emitWithAck(event)
    : socket.emitWithAck(event, payload))) as Ack;
}

const balanceOf = (client: Client) => client.wallets.at(-1)?.balance;

try {
  const alice = await connect("Alice");
  const bob = await connect("Bob");
  const carol = await connect("Carol");
  await until(() => balanceOf(alice) === 10_000, "Wallet initial absent");

  const refused = await emit(alice, "tower:command", {
    type: "start",
    difficulty: "normal",
    bet: 100,
  });
  assert(!refused.ok && refused.error.includes("Ouvrez la Tower"));

  assert((await emit(alice, "tower:join")).ok);
  assert((await emit(bob, "tower:join")).ok);
  const started = await emit(alice, "tower:command", {
    type: "start",
    difficulty: "normal",
    bet: 100,
  });
  assert(started.ok, JSON.stringify(started));
  await until(() => balanceOf(alice) === 9_900, "Mise non débitée du wallet");
  await until(
    () =>
      bob.feeds.some((feed) =>
        feed.ghosts.some((ghost) => ghost.playerId === alice.id),
      ),
    "Bob ne voit pas Alice dans sa salle",
  );

  assert((await emit(alice, "tower:command", { type: "pick", column: 0 })).ok);
  await until(() => alice.tower?.run?.floor === 1, "Étage non franchi");

  // Leaving the Tower settles the climb: 100 × 1.2.
  assert((await emit(alice, "tower:leave")).ok);
  await until(() => balanceOf(alice) === 10_020, "Sortie non encaissée");
  await until(
    () =>
      bob.feeds.at(-1)!.feed.some((item) => item.status === "cashed") &&
      !bob.feeds.at(-1)!.ghosts.some((ghost) => ghost.playerId === alice.id),
    "La sortie d’Alice n’est pas publiée dans la salle",
  );
  const late = await emit(alice, "tower:command", { type: "pick", column: 0 });
  assert(!late.ok);

  // Carol never opened the Tower: no public update reached her.
  assert.equal(carol.feeds.length, 0);
  for (const client of clients)
    assert(
      client.wallets.every(
        (wallet, index) => !index || wallet.seq > client.wallets[index - 1].seq,
      ),
      "Les wallets doivent arriver dans l’ordre",
    );
  console.log("Tower multijoueur OK");
} finally {
  for (const client of clients) client.socket.disconnect();
}

import { strict as assert } from "node:assert";
import { io, type Socket } from "socket.io-client";
import {
  createTestSession,
  socketAuth,
  type TestSession,
} from "./auth-session";
import type { Ack } from "../src/lib/types";
import type {
  GameInvite,
  GameInviteReply,
  PlayerProfile,
  PlayerSearchResult,
  SocialOverview,
} from "../src/lib/social";

const url = process.env.TEST_URL ?? "http://localhost:3000";
const suffix = Math.random().toString(36).slice(2, 7);
const sockets: Socket[] = [];

async function until(check: () => boolean, message: string, timeout = 8000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(message);
    await Bun.sleep(50);
  }
}

async function api<T>(
  session: TestSession,
  path: string,
  init: { method?: string; body?: unknown; origin?: string } = {},
) {
  const response = await fetch(url + path, {
    method: init.method ?? "GET",
    headers: {
      cookie: session.cookie,
      origin: init.origin ?? url,
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return {
    status: response.status,
    body: (await response.json()) as T & { error?: string },
  };
}

type Client = {
  session: TestSession;
  socket: Socket;
  tableId: string;
  changes: number;
  invites: GameInvite[];
  replies: GameInviteReply[];
};

async function connect(name: string): Promise<Client> {
  const session = await createTestSession(url, name);
  const socket = io(url, socketAuth(session, url));
  sockets.push(socket);
  const client: Client = {
    session,
    socket,
    tableId: "",
    changes: 0,
    invites: [],
    replies: [],
  };
  let blackjackSnapshots = 0;
  socket.on("state", () => blackjackSnapshots++);
  socket.on("friends:changed", () => client.changes++);
  socket.on("friends:invite", (invite: GameInvite) =>
    client.invites.push(invite),
  );
  socket.on("friends:invite:reply", (reply: GameInviteReply) =>
    client.replies.push(reply),
  );
  await until(() => socket.connected, "WebSocket did not connect");
  const ack: Ack = await socket.timeout(5000).emitWithAck("join", {});
  assert.equal(ack.ok, true, JSON.stringify(ack));
  assert.equal(ack.tableId, undefined, "Club entry must not join Blackjack");
  assert.equal(blackjackSnapshots, 0, "Club entry must not receive a table");
  const tableAck: Ack = await socket
    .timeout(5000)
    .emitWithAck("join", { tableId: null });
  assert.equal(tableAck.ok, true, JSON.stringify(tableAck));
  client.tableId = tableAck.tableId!;
  return client;
}

function emit(client: Client, event: string, payload: unknown) {
  return client.socket
    .timeout(5000)
    .emitWithAck(event, payload) as Promise<Ack>;
}

try {
  const alice = await connect(`Alice${suffix}`);
  const bob = await connect(`Bob${suffix}`);
  const carol = await connect(`Carol${suffix}`);

  // Every player gets a unique friend code.
  const aliceOverview = await api<SocialOverview>(
    alice.session,
    "/api/friends",
  );
  assert.equal(aliceOverview.status, 200);
  assert.match(aliceOverview.body.me.friendCode ?? "", /^[A-Z0-9]{8}$/);
  const bobCode = (await api<SocialOverview>(bob.session, "/api/friends")).body
    .me.friendCode!;
  assert.notEqual(bobCode, aliceOverview.body.me.friendCode);

  // Search: a complete friend code only, formatted or not.
  const partial = await api<{ player: PlayerSearchResult | null }>(
    alice.session,
    `/api/friends/search?code=${bobCode.slice(0, 5)}`,
  );
  assert.equal(partial.body.player, null);
  const byCode = await api<{ player: PlayerSearchResult | null }>(
    alice.session,
    `/api/friends/search?code=${bobCode.slice(0, 4)}-${bobCode.slice(4).toLowerCase()}`,
  );
  assert.equal(byCode.body.player?.id, bob.session.userId);
  assert.equal(byCode.body.player?.relation, "none");
  const ownCode = await api<{ player: PlayerSearchResult | null }>(
    alice.session,
    `/api/friends/search?code=${aliceOverview.body.me.friendCode}`,
  );
  assert.equal(ownCode.body.player?.relation, "self");

  // Refusals.
  const self = await api(alice.session, "/api/friends/requests", {
    method: "POST",
    body: { code: aliceOverview.body.me.friendCode },
  });
  assert.equal(self.status, 400);
  const foreign = await api(alice.session, "/api/friends/requests", {
    method: "POST",
    body: { userId: bob.session.userId },
    origin: "https://evil.example",
  });
  assert.equal(foreign.status, 403);

  // Request, live notification, decline.
  const bobChanges = bob.changes;
  const sent = await api(alice.session, "/api/friends/requests", {
    method: "POST",
    body: { userId: bob.session.userId },
  });
  assert.equal(sent.status, 200, sent.body.error);
  await until(() => bob.changes > bobChanges, "Bob was not notified");
  const duplicate = await api(alice.session, "/api/friends/requests", {
    method: "POST",
    body: { userId: bob.session.userId },
  });
  assert.equal(duplicate.status, 409);
  let bobView = (await api<SocialOverview>(bob.session, "/api/friends")).body;
  assert.equal(bobView.incoming.length, 1);
  assert.equal(bobView.incoming[0]!.player.id, alice.session.userId);
  const declined = await api(
    bob.session,
    `/api/friends/requests/${bobView.incoming[0]!.id}/decline`,
    { method: "POST", body: {} },
  );
  assert.equal(declined.status, 200);
  assert.equal(
    (await api<SocialOverview>(alice.session, "/api/friends")).body.outgoing
      .length,
    0,
  );

  // Request by code, accept.
  await api(alice.session, "/api/friends/requests", {
    method: "POST",
    body: { code: bobCode.toLowerCase() },
  });
  bobView = (await api<SocialOverview>(bob.session, "/api/friends")).body;
  const accepted = await api(
    bob.session,
    `/api/friends/requests/${bobView.incoming[0]!.id}/accept`,
    { method: "POST", body: {} },
  );
  assert.equal(accepted.status, 200);
  const aliceFriends = (
    await api<SocialOverview>(alice.session, "/api/friends")
  ).body.friends;
  assert.deepEqual(
    aliceFriends.map((friend) => [friend.id, friend.online]),
    [[bob.session.userId, true]],
  );
  const bobAsFriend = await api<{ player: PlayerSearchResult | null }>(
    alice.session,
    `/api/friends/search?code=${bobCode}`,
  );
  assert.equal(bobAsFriend.body.player?.relation, "friend");

  // Two crossed requests make a friendship.
  await api(carol.session, "/api/friends/requests", {
    method: "POST",
    body: { userId: alice.session.userId },
  });
  const crossed = await api<{ accepted: boolean }>(
    alice.session,
    "/api/friends/requests",
    { method: "POST", body: { userId: carol.session.userId } },
  );
  assert.equal(crossed.body.accepted, true);

  // Profile.
  const profile = await api<PlayerProfile>(
    alice.session,
    `/api/players/${bob.session.userId}`,
  );
  assert.equal(profile.body.relation, "friend");
  assert.equal(profile.body.friends, 1);
  const own = await api<PlayerProfile>(
    alice.session,
    `/api/players/${alice.session.userId}`,
  );
  assert.equal(own.body.relation, "self");
  assert.equal(own.body.friends, 2);
  // Gains are shared with friends by default, the profile with everyone.
  assert.deepEqual(own.body.visibility, {
    profile: "public",
    earnings: "friends",
  });
  assert.equal(profile.body.visibility, null, "visibility leaked to a friend");
  assert.ok(profile.body.stats, "a public profile carries its stats");
  assert.ok(profile.body.stats?.summary.earnings, "a friend reads the gains");

  // Closing the gains leaves the rest of the profile readable.
  await api(alice.session, "/api/players/me/visibility", {
    method: "PATCH",
    body: { profile: "public", earnings: "private" },
  });
  const guarded = await api<PlayerProfile>(
    bob.session,
    `/api/players/${alice.session.userId}`,
  );
  assert.ok(guarded.body.stats, "the profile stays open");
  assert.equal(
    guarded.body.stats?.summary.earnings,
    null,
    "private gains reached a friend",
  );
  for (const game of guarded.body.stats?.games ?? [])
    assert.equal(game.earnings, null, "private gains reached a friend by game");

  // Closing the profile hides the statistics entirely.
  await api(alice.session, "/api/players/me/visibility", {
    method: "PATCH",
    body: { profile: "private", earnings: "public" },
  });
  const closed = await api<PlayerProfile>(
    bob.session,
    `/api/players/${alice.session.userId}`,
  );
  assert.equal(closed.body.stats, null, "a private profile leaked its stats");
  assert.equal(closed.body.relation, "friend", "the relation stays readable");
  const stillMine = await api<PlayerProfile>(
    alice.session,
    `/api/players/${alice.session.userId}`,
  );
  assert.ok(stillMine.body.stats?.summary.earnings, "hidden from its owner");

  const refused = await api(alice.session, "/api/players/me/visibility", {
    method: "PATCH",
    body: { profile: "everyone", earnings: "public" },
  });
  assert.equal(refused.status, 400);
  await api(alice.session, "/api/players/me/visibility", {
    method: "PATCH",
    body: { profile: "public", earnings: "friends" },
  });

  // Invitation to the current public Blackjack table.
  const wrongTable = await emit(alice, "friends:invite", {
    friendId: bob.session.userId,
    game: "blackjack",
    tableId: "ZZZZ9999",
  });
  assert.equal(wrongTable.ok, false);
  const invited = await emit(alice, "friends:invite", {
    friendId: bob.session.userId,
    game: "blackjack",
    tableId: alice.tableId,
  });
  assert.equal(invited.ok, true, JSON.stringify(invited));
  await until(() => bob.invites.length === 1, "Bob got no invitation");
  assert.equal(bob.invites[0]!.from.id, alice.session.userId);
  assert.equal(bob.invites[0]!.private, false);
  const spam = await emit(alice, "friends:invite", {
    friendId: bob.session.userId,
    game: "blackjack",
    tableId: alice.tableId,
  });
  assert.equal(spam.ok, false);

  // Accepting joins the same public table and tells the sender.
  const joined: Ack = await emit(bob, "join", { tableId: alice.tableId });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  assert.equal((joined as { tableId: string }).tableId, alice.tableId);
  await emit(bob, "friends:invite:reply", {
    inviteId: bob.invites[0]!.id,
    toId: alice.session.userId,
    accepted: true,
  });
  await until(() => alice.replies.length === 1, "Alice got no reply");
  assert.equal(alice.replies[0]!.accepted, true);

  // Private table invitation.
  const privateAck: Ack = await emit(carol, "join", { createPrivate: true });
  const privateTable = (privateAck as { tableId: string }).tableId;
  const privateInvite = await emit(carol, "friends:invite", {
    friendId: alice.session.userId,
    game: "blackjack",
    tableId: privateTable,
  });
  assert.equal(privateInvite.ok, true, JSON.stringify(privateInvite));
  await until(() => alice.invites.length === 1, "Alice got no invitation");
  assert.equal(alice.invites[0]!.private, true);
  assert.equal(alice.invites[0]!.tableId, privateTable);

  // Game without tables, once the anti-spam delay has passed.
  await Bun.sleep(5100);
  const tower = await emit(carol, "friends:invite", {
    friendId: alice.session.userId,
    game: "tower",
  });
  assert.equal(tower.ok, true, JSON.stringify(tower));

  // Removing a friend stops invitations.
  const removed = await api(
    bob.session,
    `/api/friends/${alice.session.userId}`,
    {
      method: "DELETE",
    },
  );
  assert.equal(removed.status, 200);
  const notFriend = await emit(alice, "friends:invite", {
    friendId: bob.session.userId,
    game: "blackjack",
    tableId: alice.tableId,
  });
  assert.equal(notFriend.ok, false);

  // Presence follows the connections.
  const carolChanges = carol.changes;
  bob.socket.disconnect();
  alice.socket.disconnect();
  await until(
    () => carol.changes > carolChanges,
    "Carol was not told Alice left",
  );
  const carolFriends = (
    await api<SocialOverview>(carol.session, "/api/friends")
  ).body.friends;
  assert.equal(carolFriends[0]!.online, false);

  console.log("Amis · tous les scénarios passent.");
} finally {
  for (const socket of sockets) socket.disconnect();
}

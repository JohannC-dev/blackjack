import { describe, expect, test } from "bun:test";
import { ChickenManager, CHICKEN_ABANDON_MS } from "../server/chicken";
import {
  CHICKEN_DIFFICULTIES,
  CHICKEN_MULTIPLIERS,
  chickenPayout,
} from "../src/lib/chicken";
import type { Player } from "../server/engine";
import type { ChickenClientState, ChickenPublicState } from "../src/lib/types";

const makePlayer = (id: string): Player => ({
  id,
  token: id,
  name: `Poulet ${id}`,
  balance: 1_000_000,
  connected: true,
  ready: false,
  roomId: "CLUB",
  lastSeen: 0,
});

const create = (random: (max: number) => number = (max) => max - 1) => {
  const sent = new Map<string, ChickenClientState>();
  const feeds: { channel: string; state: ChickenPublicState }[] = [];
  const manager = new ChickenManager(
    (id, state) => sent.set(id, state),
    (channel, state) => feeds.push({ channel, state }),
    random,
  );
  return { manager, sent, feeds };
};

describe("Chicken", () => {
  test("the published table follows the twenty-position draw at 98%", () => {
    for (const [difficulty, config] of Object.entries(CHICKEN_DIFFICULTIES) as [
      keyof typeof CHICKEN_DIFFICULTIES,
      typeof CHICKEN_DIFFICULTIES.easy,
    ][]) {
      let survival = 1;
      CHICKEN_MULTIPLIERS[difficulty].forEach((value, index) => {
        survival *= (20 - config.hazards - index) / (20 - index);
        expect(value).toBe(
          Math.round((0.98 / survival + Number.EPSILON) * 100) / 100,
        );
      });
    }
    expect(chickenPayout(5_000, "expert", 10)).toBe(905_304_400);
  });

  test("each run is private, while active positions are shared inside the room", () => {
    const { manager, sent, feeds } = create();
    const alice = makePlayer("alice");
    const bob = makePlayer("bob");
    const room = manager.enter(alice).roomId;
    manager.enter(bob);
    manager.command(
      alice,
      { type: "start", difficulty: "medium", bet: 5_000 },
      1_000,
    );
    expect(alice.balance).toBe(995_000);
    expect(sent.get("alice")?.run).toMatchObject({
      step: 0,
      status: "playing",
    });
    expect(JSON.stringify(sent.get("alice"))).not.toContain("hazards");
    expect(feeds.at(-1)?.state.ghosts).toEqual([
      { playerId: "alice", name: "Poulet alice", step: 0 },
    ]);
    expect(sent.get("bob")?.run).toBeNull();
    expect(room).toBe(manager.roomOf("bob")!.id);
    manager.command(alice, { type: "advance" }, 2_000);
    expect(sent.get("alice")?.run?.status).toBe("lost");
    expect(feeds.at(-1)?.state.ghosts).toEqual([]);
    expect(alice.balance).toBe(995_000);
  });

  test("private rooms need an invitation and keep their guests after the host leaves", () => {
    const { manager } = create();
    const alice = makePlayer("alice");
    const bob = makePlayer("bob");
    const room = manager.enter(alice, { createPrivate: true }).roomId;
    expect(() => manager.enter(bob, { roomId: room })).toThrow("invitation");
    manager.invite(alice.id, bob.id, room);
    manager.enter(bob, { roomId: room });
    manager.leave(alice);
    expect(manager.roomOf(bob.id)?.id).toBe(room);
    expect(manager.roomOf(bob.id)?.visibility).toBe("private");
    manager.leave(bob);
    expect(manager.roomOf(bob.id)).toBeUndefined();
  });

  test("a private invitation cannot enter a full room", () => {
    const { manager } = create();
    const host = makePlayer("host");
    const room = manager.enter(host, { createPrivate: true }).roomId;
    for (let index = 0; index < 9; index++) {
      const guest = makePlayer(`guest-${index}`);
      manager.invite(host.id, guest.id, room);
      manager.enter(guest, { roomId: room });
    }
    expect(() => manager.invite(host.id, "late", room)).toThrow("plein");
    expect(manager.roomOf(host.id)?.members.size).toBe(10);
  });

  test("receiving another invitation does not revoke an earlier one", () => {
    const { manager } = create();
    const first = makePlayer("first");
    const second = makePlayer("second");
    const guest = makePlayer("guest");
    const firstRoom = manager.enter(first, { createPrivate: true }).roomId;
    const secondRoom = manager.enter(second, { createPrivate: true }).roomId;
    manager.invite(first.id, guest.id, firstRoom);
    manager.invite(second.id, guest.id, secondRoom);
    expect(manager.enter(guest, { roomId: firstRoom }).roomId).toBe(firstRoom);
  });

  test("leaving before the first jump refunds; a disconnected run settles after ten minutes", () => {
    const { manager, sent } = create(() => 0);
    const alice = makePlayer("alice");
    manager.enter(alice);
    manager.command(
      alice,
      { type: "start", difficulty: "easy", bet: 5_000 },
      1_000,
    );
    manager.leave(alice, 1_100);
    expect(alice.balance).toBe(1_000_000);
    manager.enter(alice);
    manager.command(
      alice,
      { type: "start", difficulty: "easy", bet: 5_000 },
      2_000,
    );
    manager.command(alice, { type: "advance" }, 2_500);
    expect(sent.get("alice")?.run?.step).toBe(1);
    manager.leave(alice, 3_000, true);
    expect(manager.roomOf(alice.id)).toBeDefined();
    manager.tick(3_000 + CHICKEN_ABANDON_MS + 1);
    expect(alice.balance).toBe(1_000_150);
    expect(manager.roomOf(alice.id)).toBeUndefined();
  });

  test("automatic play repeats and stops after the requested rounds", () => {
    const { manager, sent } = create(() => 0);
    const alice = makePlayer("alice");
    manager.enter(alice);
    manager.command(
      alice,
      {
        type: "auto:start",
        config: {
          bet: 5_000,
          difficulty: "easy",
          steps: 1,
          rounds: 2,
          stopProfit: 0,
          stopLoss: 0,
          onWinPercent: 0,
          onLossPercent: 0,
        },
      },
      1_000,
    );
    for (const now of [1_350, 1_700, 2_300, 2_650, 3_000]) manager.tick(now);
    expect(sent.get("alice")?.auto).toBeNull();
    expect(sent.get("alice")?.run?.status).toBe("cashed");
    expect(alice.balance).toBe(1_000_300);
  });

  test("disconnect stops automatic wagers but preserves the current run", () => {
    const { manager, sent } = create(() => 0);
    const alice = makePlayer("alice");
    manager.enter(alice);
    manager.command(
      alice,
      {
        type: "auto:start",
        config: {
          bet: 5_000,
          difficulty: "easy",
          steps: 1,
          rounds: 10,
          stopProfit: 0,
          stopLoss: 0,
          onWinPercent: 0,
          onLossPercent: 0,
        },
      },
      1_000,
    );
    manager.leave(alice, 1_100, true);
    manager.tick(2_000);
    expect(alice.balance).toBe(995_000);
    manager.enter(alice, {}, 2_100);
    expect(sent.get("alice")?.run).toMatchObject({
      status: "playing",
      step: 0,
    });
    expect(sent.get("alice")?.auto).toBeNull();
  });

  test("an invalid action does not cancel an automatic series", () => {
    const { manager, sent } = create(() => 0);
    const alice = makePlayer("alice");
    manager.enter(alice);
    manager.command(
      alice,
      {
        type: "auto:start",
        config: {
          bet: 5_000,
          difficulty: "easy",
          steps: 1,
          rounds: 2,
          stopProfit: 0,
          stopLoss: 0,
          onWinPercent: 0,
          onLossPercent: 0,
        },
      },
      1_000,
    );
    expect(() => manager.command(alice, { type: "cashout" }, 1_100)).toThrow(
      "au moins un saut",
    );
    expect(() =>
      manager.command(
        alice,
        { type: "start", difficulty: "easy", bet: 5_000 },
        1_100,
      ),
    ).toThrow("en cours");
    expect(sent.get("alice")?.auto?.rounds).toBe(2);
  });
});

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { makeShoe, Table, type Player } from "../server/engine";
import {
  evaluate21Plus3,
  evaluateSuperPairs,
  isRed,
  score,
} from "../src/lib/rules";
import type { Card, Suit } from "../src/lib/types";

const card = (rank: number, suit: Suit = "spades"): Card => ({
  id: randomUUID(),
  rank,
  suit,
});
function player(name = "Alice"): Player {
  return {
    id: randomUUID(),
    token: randomUUID(),
    name,
    balance: 2000,
    ready: false,
    connected: true,
    roomId: "TEST",
    lastSeen: Date.now(),
  };
}
function tableWith(draws: Card[], players = [player()]) {
  const shoe = [
    ...Array.from({ length: 200 }, () => card(10)),
    ...draws.toReversed(),
  ];
  const table = new Table("TEST", undefined, shoe);
  players.forEach((p) => {
    table.add(p);
    const seat = table.state.seats.find((s) => s.playerId === p.id)!;
    table.command(p.id, {
      type: "bet",
      seat: seat.index,
      bet: { main: 25, three: 0, pairs: 0 },
    });
  });
  return { table, p: players[0], players };
}
function begin(table: Table, players: Player[]) {
  players.forEach((p) => table.command(p.id, { type: "ready", ready: true }));
  table.startRound();
  let now = Date.now() + 1000;
  while (table.state.phase === "dealing") {
    table.tick(now);
    now += 1000;
  }
  if (table.state.phase === "bonuses") table.tick(now + 4000);
}
function settle(table: Table) {
  let now = Date.now() + 100_000;
  while (table.state.phase === "dealer") {
    table.tick(now);
    now += 1000;
  }
  expect(table.state.phase).toBe("settled");
}
function ownHand(table: Table, p: Player) {
  return table.state.seats.find((s) => s.playerId === p.id)!.hands[0];
}

describe("Cards and requested side-bet paytables", () => {
  test("8 complete decks with unique identities", () => {
    const shoe = makeShoe();
    expect(shoe).toHaveLength(416);
    expect(new Set(shoe.map((c) => c.id)).size).toBe(416);
    expect(
      shoe.filter((c) => c.rank === 7 && c.suit === "hearts"),
    ).toHaveLength(8);
  });
  test("aces switch from 11 to 1 without busting", () => {
    expect(score([card(1), card(6)])).toEqual({ total: 17, soft: true });
    expect(score([card(1), card(1), card(9)])).toEqual({
      total: 21,
      soft: true,
    });
    expect(score([card(1), card(10), card(10)])).toEqual({
      total: 21,
      soft: false,
    });
  });
  test.each([
    [[card(1), card(2), card(3)], "Straight Flush"],
    [[card(1), card(12), card(13)], "Straight Flush"],
    [[card(7), card(7), card(7)], "Three of a Kind"],
    [[card(5), card(6, "hearts"), card(7)], "Straight"],
    [[card(2), card(5), card(9)], "Flush"],
  ] as [Card[], string][])(
    "21+3 winning category pays net 9:1: %s",
    (cards, label) => {
      expect(evaluate21Plus3(cards, 5)).toEqual({ label, odds: 9, payout: 50 });
    },
  );
  test("no wraparound straight or win on a zero stake", () => {
    expect(
      evaluate21Plus3([card(13), card(1, "hearts"), card(2)], 5),
    ).toBeNull();
    expect(evaluate21Plus3([card(1), card(2), card(3)], 0)).toBeNull();
    expect(evaluateSuperPairs([card(7), card(7), card(7)], 0)).toBeNull();
  });
  test.each([
    [[card(7), card(7), card(7)], "Suited Trips", 50],
    [[card(7), card(7), card(8)], "Suited Pair", 25],
    [[card(7, "hearts"), card(7, "diamonds"), card(8)], "Prime Pair", 10],
    [[card(7), card(7, "clubs"), card(8)], "Prime Pair", 10],
    [[card(7), card(7, "hearts"), card(8)], "Any Pair", 8],
  ] as [Card[], string, number][])(
    "Super Pairs highest match only: %s",
    (cards, label, odds) => {
      expect(evaluateSuperPairs(cards, 10)).toEqual({
        label,
        odds,
        payout: (odds + 1) * 10,
      });
    },
  );
});

describe("European blackjack and credit accounting", () => {
  test("winnings remain optional across rounds without a streak cap", () => {
    const { table, p } = tableWith([card(10), card(7), card(8), card(10)]);
    begin(table, [p]);
    table.command(p.id, { type: "stand", handId: table.state.activeHandId! });
    settle(table);

    const gamble = table.state.gambles.find(
      (entry) => entry.playerId === p.id,
    )!;
    expect(gamble.stake).toBe(25);
    expect(table.state.deadline).not.toBeNull();
    table.tick(table.state.deadline!);
    expect(table.state.phase).toBe("betting");
    expect(gamble.status).toBe("available");
    table.command(p.id, { type: "ready", ready: true });
    table.startRound();
    expect(table.state.phase).toBe("dealing");
    expect(table.state.gambles).toContain(gamble);
    const balanceBeforeGambles = p.balance;
    for (let streak = 1; streak <= 12; streak++) {
      const nextCard = table.shoe.at(-1)!;
      table.command(p.id, {
        type: "gamble",
        color: isRed(nextCard) ? "red" : "black",
      });
      expect(gamble.status).toBe("available");
      expect(gamble.result).toBe("win");
      expect(gamble.streak).toBe(streak);
      expect(gamble.stake).toBe(25 * 2 ** streak);
    }
    expect(p.balance).toBe(balanceBeforeGambles + 25 * (2 ** 12 - 1));
    expect(table.state.history[0].net).toBe(25 * 2 ** 12);
    table.command(p.id, { type: "cashout" });
    expect(gamble.status).toBe("cashed");
    expect(() => table.command(p.id, { type: "gamble", color: "red" })).toThrow(
      "Aucun gain",
    );
  });

  test("a wrong color ends the gamble and removes only the current winnings", () => {
    const { table, p } = tableWith([card(10), card(7), card(8), card(10)]);
    begin(table, [p]);
    table.command(p.id, { type: "stand", handId: table.state.activeHandId! });
    settle(table);

    const gamble = table.state.gambles.find(
      (entry) => entry.playerId === p.id,
    )!;
    const before = p.balance;
    const nextCard = table.shoe.at(-1)!;
    table.command(p.id, {
      type: "gamble",
      color: isRed(nextCard) ? "black" : "red",
    });
    expect(gamble.status).toBe("lost");
    expect(gamble.result).toBe("lose");
    expect(p.balance).toBe(before - 25);
    expect(table.state.history[0].net).toBe(0);
    expect(() => table.command(p.id, { type: "cashout" })).toThrow(
      "Aucun gain",
    );
  });

  test("side bets enter a paid phase before any player action is allowed", () => {
    const { table, p } = tableWith([
      card(7),
      card(7),
      card(7),
      card(5),
      card(10),
    ]);
    table.command(p.id, {
      type: "bet",
      seat: 2,
      bet: { main: 25, three: 5, pairs: 5 },
    });
    p.balance = 35;
    table.command(p.id, { type: "ready", ready: true });
    table.startRound();
    let now = Date.now() + 1000;
    while (table.state.phase === "dealing") {
      table.tick(now);
      now += 1000;
    }
    expect(table.state.phase).toBe("bonuses");
    expect(p.balance).toBe(305);
    expect(table.state.activeHandId).toBeNull();
    expect(() =>
      table.command(p.id, { type: "hit", handId: ownHand(table, p).id }),
    ).toThrow("tour");
    table.tick(now + 4000);
    expect(table.state.phase).toBe("playing");
    // The just-paid bonus can fund a double immediately.
    table.command(p.id, { type: "double", handId: ownHand(table, p).id });
    settle(table);
    expect(p.balance).toBe(380);
    expect(table.state.history[0].net).toBe(345);
    expect(table.state.history[0].bets).toEqual([
      {
        type: "main",
        seat: 2,
        bet: 50,
        payout: 100,
        net: 50,
        result: "win",
      },
      {
        type: "three",
        seat: 2,
        bet: 5,
        payout: 50,
        net: 45,
        result: "win",
        label: "Three of a Kind",
      },
      {
        type: "pairs",
        seat: 2,
        bet: 5,
        payout: 255,
        net: 250,
        result: "win",
        label: "Suited Trips",
      },
    ]);
  });
  test("only one dealer card exists before players finish; natural pays 3:2", () => {
    const { table, p } = tableWith([card(1), card(9), card(13), card(8)]);
    begin(table, [p]);
    expect(table.snapshot().dealer).toHaveLength(1);
    expect(p.balance).toBe(1975);
    settle(table);
    expect(p.balance).toBe(2037.5);
    expect(ownHand(table, p).result).toBe("blackjack");
    expect(table.state.history[0].net).toBe(37.5);
  });
  test("dealer stands on soft 17", () => {
    const { table, p } = tableWith([
      card(10),
      card(1),
      card(8),
      card(6),
      card(10),
    ]);
    begin(table, [p]);
    table.command(p.id, { type: "stand", handId: ownHand(table, p).id });
    settle(table);
    expect(table.state.dealer).toHaveLength(2);
    expect(p.balance).toBe(2025);
  });
  test("dealer blackjack loses the whole doubled bet (ENHC)", () => {
    const { table, p } = tableWith([
      card(5),
      card(1),
      card(6),
      card(10),
      card(13),
    ]);
    begin(table, [p]);
    table.command(p.id, { type: "double", handId: ownHand(table, p).id });
    settle(table);
    expect(p.balance).toBe(1950);
    expect(table.state.history[0].net).toBe(-50);
    expect(table.state.history[0].bets).toEqual([
      {
        type: "main",
        seat: 2,
        bet: 50,
        payout: 0,
        net: -50,
        result: "lose",
      },
      {
        type: "three",
        seat: 2,
        bet: 0,
        payout: 0,
        net: 0,
        result: "none",
      },
      {
        type: "pairs",
        seat: 2,
        bet: 0,
        payout: 0,
        net: 0,
        result: "none",
      },
    ]);
    expect(ownHand(table, p).bet).toBe(50);
  });
  test("a natural pushes against a dealer natural", () => {
    const { table, p } = tableWith([card(1), card(1), card(13), card(10)]);
    begin(table, [p]);
    settle(table);
    expect(p.balance).toBe(2000);
    expect(ownHand(table, p).result).toBe("push");
  });
  test("split aces take one card and their 21 pays 1:1", () => {
    const { table, p } = tableWith([
      card(1),
      card(10),
      card(1),
      card(13),
      card(9),
      card(7),
    ]);
    begin(table, [p]);
    table.command(p.id, { type: "split", handId: ownHand(table, p).id });
    settle(table);
    const hands = table.state.seats.find((s) => s.playerId === p.id)!.hands;
    expect(hands).toHaveLength(2);
    expect(hands.map((h) => h.status)).toEqual(["stood", "stood"]);
    expect(hands.map((h) => h.payout)).toEqual([50, 50]);
    expect(p.balance).toBe(2050);
  });
  test("all ten-value cards can be split together", () => {
    const { table, p } = tableWith([
      card(12),
      card(6),
      card(10),
      card(9),
      card(2),
      card(10),
    ]);
    begin(table, [p]);
    const original = ownHand(table, p);
    expect(() =>
      table.command(p.id, { type: "split", handId: original.id }),
    ).not.toThrow();
    const hands = table.state.seats.find((s) => s.playerId === p.id)!.hands;
    expect(hands).toHaveLength(2);
    expect(hands[0].cards[0].rank).toBe(12);
    expect(hands[1].cards[0].rank).toBe(10);
  });
  test("dealer blackjack loses all split bets", () => {
    const { table, p } = tableWith([
      card(8),
      card(1),
      card(8),
      card(10),
      card(10),
      card(13),
    ]);
    begin(table, [p]);
    table.command(p.id, { type: "split", handId: ownHand(table, p).id });
    for (let i = 0; i < 2; i++)
      table.command(p.id, { type: "stand", handId: table.state.activeHandId! });
    settle(table);
    expect(p.balance).toBe(1950);
  });
  test("side bets are paid independently and once, even after a bust", () => {
    const { table, p } = tableWith([
      card(7),
      card(7),
      card(7),
      card(10),
      card(10),
    ]);
    table.command(p.id, {
      type: "bet",
      seat: 2,
      bet: { main: 25, three: 5, pairs: 5 },
    });
    begin(table, [p]);
    expect(p.balance).toBe(2270); // Already paid before any blackjack action.
    table.command(p.id, { type: "hit", handId: ownHand(table, p).id });
    settle(table);
    expect(p.balance).toBe(2270); // 2000 - 35 + 50 + 255.
    table.tick(Date.now());
    expect(p.balance).toBe(2270);
  });
  test("double adds exactly one card; a busted double loses twice", () => {
    const { table, p } = tableWith([
      card(10),
      card(10),
      card(6),
      card(10),
      card(7),
    ]);
    begin(table, [p]);
    const hand = ownHand(table, p);
    table.command(p.id, { type: "double", handId: hand.id });
    settle(table);
    expect(hand.cards).toHaveLength(3);
    expect(hand.result).toBe("lose");
    expect(p.balance).toBe(1950);
  });
  test("a concealed double card stays server-only until the dealer finishes", () => {
    const hiddenCard = card(10, "hearts");
    const { table, p } = tableWith([
      card(10),
      card(10),
      card(6),
      hiddenCard,
      card(7),
    ]);
    begin(table, [p]);
    const hand = ownHand(table, p);
    table.command(p.id, {
      type: "double",
      handId: hand.id,
      reveal: "dealer",
    });

    expect(hand.cards[2]).toEqual(hiddenCard);
    expect(hand.status).toBe("bust");
    const publicHand = table
      .snapshot()
      .seats.flatMap((seat) => seat.hands)
      .find((candidate) => candidate.id === hand.id)!;
    expect(publicHand.cards[2]).toEqual({
      id: hiddenCard.id,
      rank: 0,
      suit: "spades",
      hidden: true,
    });
    expect(publicHand.status).toBe("stood");
    expect(JSON.stringify(table.snapshot())).not.toContain(
      '"rank":10,"suit":"hearts"',
    );

    settle(table);
    const revealedHand = table
      .snapshot()
      .seats.flatMap((seat) => seat.hands)
      .find((candidate) => candidate.id === hand.id)!;
    expect(revealedHand.cards[2]).toEqual(hiddenCard);
    expect(revealedHand.status).toBe("bust");
  });
  test("an immediately revealed double remains visible during dealer play", () => {
    const doubleCard = card(4, "diamonds");
    const { table, p } = tableWith([
      card(10),
      card(10),
      card(6),
      doubleCard,
      card(7),
    ]);
    begin(table, [p]);
    const hand = ownHand(table, p);
    table.command(p.id, {
      type: "double",
      handId: hand.id,
      reveal: "now",
    });
    expect(table.snapshot().seats[2].hands[0].cards[2]).toEqual(doubleCard);
  });
  test("an unknown double reveal mode is rejected", () => {
    const { table, p } = tableWith([card(10), card(10), card(6)]);
    begin(table, [p]);
    expect(() =>
      table.command(p.id, {
        type: "double",
        handId: ownHand(table, p).id,
        reveal: "later",
      } as never),
    ).toThrow("révélation");
  });
});

describe("Multiplayer authority and lifecycle", () => {
  test("one player may take multiple spots; bets must fit their combined balance", () => {
    const { table, p } = tableWith([]);
    p.balance = 40;
    table.command(p.id, { type: "claim", seat: 1 });
    expect(table.state.seats[1].bet.main).toBe(0);
    table.command(p.id, {
      type: "bet",
      seat: 1,
      bet: { main: 5, three: 0, pairs: 0 },
    });
    expect(() =>
      table.command(p.id, {
        type: "bet",
        seat: 1,
        bet: { main: 25, three: 0, pairs: 0 },
      }),
    ).toThrow("crédits");
    expect(() =>
      table.command(p.id, {
        type: "bet",
        seat: 1,
        bet: { main: -5, three: 0, pairs: 0 },
      }),
    ).toThrow();
    expect(() =>
      table.command(p.id, {
        type: "bet",
        seat: 1,
        bet: { main: 5, three: NaN, pairs: 0 },
      }),
    ).toThrow();
  });
  test("a betting action gives everyone twelve seconds to finish their setup", () => {
    const alice = player(),
      bob = player("Bob");
    const { table } = tableWith([], [alice, bob]);
    const bobSeat = table.state.seats.find((seat) => seat.playerId === bob.id)!;

    table.command(alice.id, { type: "ready", ready: true });
    expect(table.state.deadline).not.toBeNull();

    // Simulate a countdown that is close to expiring. Bob's bet is a valid
    // action while Alice remains ready, so it must move the deadline forward.
    table.state.deadline = Date.now() + 250;
    table.command(bob.id, {
      type: "bet",
      seat: bobSeat.index,
      bet: { main: 30, three: 0, pairs: 0 },
    });
    expect(table.state.deadline).not.toBeNull();
    expect(table.state.deadline!).toBeGreaterThan(Date.now() + 10_000);

    // A ready player cancelling readiness is also a table action. With Bob
    // ready, Alice's cancellation must leave a fresh twelve-second window.
    table.command(bob.id, { type: "ready", ready: true });
    table.state.deadline = Date.now() + 250;
    table.command(alice.id, { type: "ready", ready: false });
    expect(table.state.deadline).not.toBeNull();
    expect(table.state.deadline!).toBeGreaterThan(Date.now() + 10_000);
  });
  test("all hands play in table order, with correct ownership", () => {
    const alice = player(),
      bob = player("Bob");
    const { table } = tableWith(
      [
        card(10),
        card(10),
        card(10),
        card(10),
        card(8),
        card(8),
        card(8),
        card(7),
      ],
      [alice, bob],
    );
    table.command(alice.id, { type: "claim", seat: 3 });
    table.command(alice.id, {
      type: "bet",
      seat: 3,
      bet: { main: 25, three: 0, pairs: 0 },
    });
    begin(table, [alice, bob]);
    expect(table.state.seats.filter((s) => s.hands.length)).toHaveLength(3);
    expect(() =>
      table.command(alice.id, {
        type: "hit",
        handId: table.state.activeHandId!,
      }),
    ).toThrow("appartient");
    table.command(bob.id, { type: "stand", handId: table.state.activeHandId! });
    const first = table.state.activeHandId!;
    table.command(alice.id, { type: "stand", handId: first });
    expect(() =>
      table.command(alice.id, { type: "stand", handId: first }),
    ).toThrow("tour");
    table.command(alice.id, {
      type: "stand",
      handId: table.state.activeHandId!,
    });
    settle(table);
    expect(alice.balance).toBe(2050);
    expect(bob.balance).toBe(2025);
  });
  test("unready players are not charged or dealt cards", () => {
    const alice = player(),
      bob = player("Bob");
    const { table } = tableWith([card(10), card(10), card(8)], [alice, bob]);
    begin(table, [alice]);
    expect(bob.balance).toBe(2000);
    const bobSeat = table.state.seats.find((s) => s.playerId === bob.id)!;
    expect(bobSeat.hands).toHaveLength(0);
    expect(bobSeat.bet).toEqual({ main: 0, three: 0, pairs: 0 });
  });
  test("a timed-out hand stands; disconnect cannot freeze the game", () => {
    const { table, p } = tableWith([card(10), card(10), card(8), card(7)]);
    begin(table, [p]);
    p.connected = false;
    table.tick(Date.now() + 30000);
    settle(table);
    expect(ownHand(table, p).status).toBe("stood");
    expect(p.balance).toBe(2025);
  });
  test("reconnection keeps active hands and does not charge again", () => {
    const { table, p } = tableWith([card(10), card(10), card(8)]);
    begin(table, [p]);
    const handId = ownHand(table, p).id;
    table.add(p);
    expect(ownHand(table, p).id).toBe(handId);
    expect(p.balance).toBe(1975);
    expect(() => table.remove(p.id)).toThrow("Terminez");
  });
  test("a spectator may leave an active table, but a seated player may not", () => {
    const { table, p } = tableWith([]);
    table.state.phase = "playing";
    const spectator = player("Spectator");
    table.add(spectator);

    expect(() => table.remove(spectator.id)).not.toThrow();
    expect(table.players.has(spectator.id)).toBe(false);
    expect(() => table.remove(p.id)).toThrow("Terminez");
  });
  test("snapshot never exposes session tokens or remaining shoe cards", () => {
    const { table, p } = tableWith([]);
    const snapshot = JSON.stringify(table.snapshot());
    expect(snapshot).not.toContain(p.token);
    expect(snapshot).not.toContain('"shoe":');
  });
  test("mutating or releasing someone else's bet is rejected", () => {
    const alice = player(),
      bob = player("Bob");
    const { table } = tableWith([], [alice, bob]);
    expect(() => table.command(bob.id, { type: "release", seat: 2 })).toThrow(
      "appartient",
    );
    expect(() =>
      table.command(bob.id, {
        type: "bet",
        seat: 2,
        bet: { main: 500, three: 100, pairs: 100 },
      }),
    ).toThrow("appartient");
  });
  test("a player can release one own seat without changing balance or other bets", () => {
    const { table, p } = tableWith([]);
    const first = table.state.seats.find((s) => s.playerId === p.id)!;
    table.command(p.id, {
      type: "bet",
      seat: first.index,
      bet: { main: 25, three: 5, pairs: 5 },
    });
    table.command(p.id, { type: "claim", seat: 1 });
    table.command(p.id, {
      type: "bet",
      seat: 1,
      bet: { main: 50, three: 0, pairs: 0 },
    });
    table.command(p.id, { type: "ready", ready: true });
    const balanceBeforeRelease = p.balance;

    table.command(p.id, { type: "release", seat: 1 });

    expect(p.balance).toBe(balanceBeforeRelease);
    expect(p.ready).toBe(false);
    expect(table.state.deadline).toBeNull();
    expect(table.state.seats[1]).toMatchObject({
      playerId: null,
      bet: { main: 0, three: 0, pairs: 0 },
      hands: [],
      sides: { three: null, pairs: null },
      committed: 0,
    });
    expect(table.state.seats[first.index].playerId).toBe(p.id);
    expect(table.state.seats[first.index].bet).toEqual({
      main: 25,
      three: 5,
      pairs: 5,
    });
    expect(() => table.command(p.id, { type: "claim", seat: 1 })).not.toThrow();
  });
  test("next round resets state and credits can only be refilled when depleted", () => {
    const { table, p } = tableWith([card(10), card(10), card(8), card(7)]);
    expect(() => table.command(p.id, { type: "refill" })).toThrow("sous 5");
    begin(table, [p]);
    table.command(p.id, { type: "stand", handId: table.state.activeHandId! });
    settle(table);
    table.tick(Date.now() + 200000);
    expect(table.state.phase).toBe("betting");
    expect(table.state.dealer).toHaveLength(0);
    expect(p.ready).toBe(false);
    expect(table.state.seats[2].hands).toHaveLength(0);
    p.balance = 0;
    table.command(p.id, { type: "refill" });
    expect(p.balance).toBe(2000);
  });
});

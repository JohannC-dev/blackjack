import { describe, expect, test } from "bun:test";
import {
  evaluatePokerHand,
  makePokerDeck,
  PokerTable,
  POKER_SHUFFLE_MS,
} from "../server/poker";
import {
  describePokerHolding,
  evaluateBestPokerHand,
  getPokerCombinationCards,
} from "../src/lib/rules";
import type { Player } from "../server/engine";
import type { Card, Suit } from "../src/lib/types";

const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const cards = (...ranks: number[]): Card[] =>
  ranks.map((rank, index) => ({
    id: `${rank}-${index}`,
    rank,
    suit: suits[index % 4],
  }));
const sameSuit = (...ranks: number[]): Card[] =>
  ranks.map((rank, index) => ({
    id: `${rank}-${index}`,
    rank,
    suit: "spades",
  }));
const player = (id: string): Player => ({
  id,
  token: `00000000-0000-0000-0000-00000000000${id}`,
  name: `Joueur ${id}`,
  balance: 10_000,
  connected: true,
  ready: false,
  roomId: "MINUIT",
  lastSeen: Date.now(),
});
const startCashHand = (table: PokerTable) => {
  const shuffleAt = Date.now() + 2_000;
  table.tick(shuffleAt);
  table.tick(shuffleAt + POKER_SHUFFLE_MS);
};

describe("Poker hand evaluator", () => {
  test("recognises every category in strict order", () => {
    const hands = [
      cards(2, 5, 7, 9, 11),
      cards(2, 2, 7, 9, 11),
      cards(2, 2, 7, 7, 11),
      cards(2, 2, 2, 9, 11),
      cards(2, 3, 4, 5, 6),
      sameSuit(2, 5, 7, 9, 11),
      cards(2, 2, 2, 9, 9),
      cards(2, 2, 2, 2, 11),
      sameSuit(9, 10, 11, 12, 13),
    ];
    expect(hands.map((hand) => evaluatePokerHand(hand).score[0])).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  test("handles the wheel and seven-card kickers", () => {
    expect(evaluatePokerHand(cards(1, 2, 3, 4, 5, 12, 13)).score).toEqual([
      4, 5,
    ]);
    expect(evaluatePokerHand(cards(1, 1, 13, 12, 9, 4, 2)).score).toEqual([
      1, 14, 13, 12, 9,
    ]);
  });

  test("returns the exact five cards used by the winning combination", () => {
    const board = sameSuit(9, 10, 11, 12, 2);
    const holeCards: Card[] = [
      { id: "king-spades", rank: 13, suit: "spades" },
      { id: "ace-hearts", rank: 1, suit: "hearts" },
    ];
    const best = evaluateBestPokerHand([...board, ...holeCards]);
    expect(best.score).toEqual([8, 13]);
    expect(best.cards.map((card) => card.id)).toEqual([
      "9-0",
      "10-1",
      "11-2",
      "12-3",
      "king-spades",
    ]);
  });

  test("highlights the made combination without unrelated kickers", () => {
    const best = evaluateBestPokerHand(cards(8, 8, 13, 11, 6, 4, 2));
    expect(getPokerCombinationCards(best).map((card) => card.id)).toEqual([
      "8-0",
      "8-1",
    ]);

    const twoPair = evaluateBestPokerHand(cards(9, 9, 5, 5, 13, 7, 2));
    expect(getPokerCombinationCards(twoPair).map((card) => card.id)).toEqual([
      "9-0",
      "9-1",
      "5-2",
      "5-3",
    ]);
  });

  test("builds one cryptographically shuffled 52-card deck", () => {
    const deck = makePokerDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.id)).size).toBe(52);
    expect(new Set(deck.map((card) => `${card.rank}-${card.suit}`)).size).toBe(
      52,
    );
  });

  test("describes the player's best visible combination", () => {
    const holeCards: Card[] = [
      { id: "six-diamonds", rank: 6, suit: "diamonds" },
      { id: "eight-clubs", rank: 8, suit: "clubs" },
    ];
    const board: Card[] = [
      { id: "six-hearts", rank: 6, suit: "hearts" },
      { id: "ace-spades", rank: 1, suit: "spades" },
      { id: "king-spades", rank: 13, suit: "spades" },
      { id: "seven-hearts", rank: 7, suit: "hearts" },
      { id: "six-clubs", rank: 6, suit: "clubs" },
    ];
    expect(describePokerHolding(holeCards, board)).toBe(
      "Three of a kind, Sixes",
    );
  });
});

describe("Poker table authority", () => {
  test("starts heads-up cash automatically and assigns standard blinds", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    table.add(player("1"), 2_000);
    table.add(player("2"), 2_000);
    const shuffleAt = Date.now() + 2_000;
    table.tick(shuffleAt);
    expect(table.phase).toBe("shuffling");
    expect(table.participants.every((entry) => !entry.cards.length)).toBe(true);
    table.tick(shuffleAt + POKER_SHUFFLE_MS);
    expect(table.phase).toBe("preflop");
    expect(
      table.participants.filter((entry) => entry.cards.length === 2),
    ).toHaveLength(2);
    expect(table.smallBlindSeat).toBe(table.button);
    expect(
      table.participants.find((entry) => entry.seat === table.smallBlindSeat)
        ?.bet,
    ).toBe(10);
    expect(
      table.participants.find((entry) => entry.seat === table.bigBlindSeat)
        ?.bet,
    ).toBe(20);
  });

  test("never exposes an opponent's hole cards before showdown", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    const one = player("1");
    const two = player("2");
    table.add(one, 2_000);
    table.add(two, 2_000);
    startCashHand(table);
    const snapshot = table.snapshot(one.id);
    const mine = snapshot.seats.find((seat) => seat.id === one.id)!;
    const theirs = snapshot.seats.find((seat) => seat.id === two.id)!;
    expect(mine.cards.every((card) => !card.hidden && card.rank > 0)).toBe(
      true,
    );
    expect(theirs.cards.every((card) => card.hidden && card.rank === 0)).toBe(
      true,
    );
    expect(mine.handLabel).toBeTruthy();
    expect(theirs.handLabel).toBeUndefined();
  });

  test("removes a player immediately while preserving their chips in the pot", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    const one = player("1");
    const two = player("2");
    table.add(one, 2_000);
    table.add(two, 2_000);
    startCashHand(table);
    const leaving = table.participants.find(
      (entry) => entry.player.id === table.activePlayerId,
    )!;
    const remaining = table.participants.find((entry) => entry !== leaving)!;

    table.requestLeave(leaving.player.id);

    expect(table.participants.map((entry) => entry.player.id)).toEqual([
      remaining.player.id,
    ]);
    expect(table.snapshot(remaining.player.id).seats).toHaveLength(1);
    expect(table.history[0].pot).toBe(30);
    expect(table.history[0].winners[0].amount).toBe(30);
  });

  test("rejects out-of-turn actions and awards an uncontested pot", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    table.add(player("1"), 2_000);
    table.add(player("2"), 2_000);
    startCashHand(table);
    const active = table.activePlayerId!;
    const other = table.participants.find(
      (entry) => entry.player.id !== active,
    )!;
    expect(() => table.action(other.player.id, "fold")).toThrow();
    table.action(active, "fold");
    expect(table.phase).toBe("showdown");
    expect(table.history[0].pot).toBe(30);
    expect(table.history[0].winners[0].amount).toBe(30);
  });

  test("gives an uncontested winner three seconds to show or hide", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    const one = player("1");
    const two = player("2");
    table.add(one, 2_000);
    table.add(two, 2_000);
    startCashHand(table);

    const foldingId = table.activePlayerId!;
    const winnerId = table.participants.find(
      (entry) => entry.player.id !== foldingId,
    )!.player.id;
    table.action(foldingId, "fold");

    expect(table.revealDeadline).not.toBeNull();
    expect(table.nextStepAt).toBe(table.revealDeadline!);
    expect(
      table
        .snapshot(winnerId)
        .seats.find((seat) => seat.id === winnerId)!
        .cards.every((card) => !card.hidden),
    ).toBe(true);
    expect(
      table
        .snapshot(foldingId)
        .seats.find((seat) => seat.id === winnerId)!
        .cards.every((card) => card.hidden),
    ).toBe(true);

    table.show(winnerId);

    expect(table.revealDeadline).toBeNull();
    expect(
      table
        .snapshot(foldingId)
        .seats.find((seat) => seat.id === winnerId)!
        .cards.every((card) => !card.hidden),
    ).toBe(true);
  });

  test("shuffles between hands before exposing the next cards", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    table.add(player("1"), 2_000);
    table.add(player("2"), 2_000);
    startCashHand(table);
    const finishedHand = table.hand;

    table.action(table.activePlayerId!, "fold");
    table.tick(table.nextStepAt);

    expect(table.phase).toBe("shuffling");
    expect(table.hand).toBe(finishedHand);
    expect(table.community).toHaveLength(0);
    expect(table.participants.every((entry) => !entry.cards.length)).toBe(true);
    expect(table.snapshot("1").pot).toBe(0);

    table.tick(table.nextStepAt);
    expect(table.phase).toBe("preflop");
    expect(table.hand).toBe(finishedHand + 1);
    expect(table.participants.every((entry) => entry.cards.length === 2)).toBe(
      true,
    );
  });

  test("waits briefly after the final check before dealing the next street", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    table.add(player("1"), 2_000);
    table.add(player("2"), 2_000);
    startCashHand(table);

    table.action(table.activePlayerId!, "call");
    table.action(table.activePlayerId!, "check");

    expect(table.phase).toBe("preflop");
    expect(table.community).toHaveLength(0);
    expect(table.activePlayerId).toBeNull();
    expect(table.message).toContain("croupier");

    table.tick(Date.now() + 1_000);
    expect(table.phase).toBe("flop");
    expect(table.community).toHaveLength(3);
  });

  test("reveals and runs out automatically after a heads-up all-in", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    const short = player("short");
    const deep = player("deep");
    table.add(short, 100);
    table.add(deep, 200);
    startCashHand(table);

    let guard = 0;
    while (
      table.phase !== "showdown" &&
      table.participants.find((entry) => entry.player.id === short.id)
        ?.status !== "all-in" &&
      guard++ < 4
    ) {
      const active = table.participants.find(
        (entry) => entry.player.id === table.activePlayerId,
      )!;
      table.action(
        active.player.id,
        active.player.id === short.id
          ? "all-in"
          : table.currentBet > active.bet
            ? "call"
            : "check",
      );
    }

    const shortEntry = table.participants.find(
      (entry) => entry.player.id === short.id,
    )!;
    const deepEntry = table.participants.find(
      (entry) => entry.player.id === deep.id,
    )!;
    expect(shortEntry.status).toBe("all-in");
    expect(deepEntry.committed).toBeGreaterThanOrEqual(shortEntry.committed);
    expect(table.activePlayerId).toBeNull();
    expect(
      table
        .snapshot(deep.id)
        .seats.find((seat) => seat.id === short.id)!
        .cards.every((card) => !card.hidden),
    ).toBe(true);

    table.tick(Date.now() + 1_000);
    expect(table.phase).toBe("flop");
    expect(table.community).toHaveLength(3);
    expect(table.activePlayerId).toBeNull();

    guard = 0;
    while (table.phase !== "showdown" && guard++ < 5)
      table.tick(Date.now() + 1_000);
    expect(table.phase).toBe("showdown");
    expect(table.community).toHaveLength(5);
  });

  test("rate limits table chat without filtering its contents", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    const one = player("1");
    table.add(one, 2_000);
    for (let index = 0; index < 5; index++)
      table.chatMessage(one.id, `message ${index}`);
    expect(() => table.chatMessage(one.id, "sixième")).toThrow();
    expect(table.snapshot(one.id).chat).toHaveLength(5);
  });

  test("builds side pots without losing chips when unequal stacks go all-in", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    table.add(player("1"), 100);
    table.add(player("2"), 200);
    table.add(player("3"), 300);
    startCashHand(table);
    let guard = 0;
    while (table.phase !== "showdown" && guard++ < 24) {
      if (!table.activePlayerId) {
        table.tick(Date.now() + 1_000);
        continue;
      }
      const active = table.participants.find(
        (entry) => entry.player.id === table.activePlayerId,
      )!;
      const maximum = active.bet + active.stack;
      table.action(
        active.player.id,
        maximum > table.currentBet ? "all-in" : "call",
      );
    }
    expect(table.phase).toBe("showdown");
    expect(
      table.participants.map((entry) => entry.committed).sort((a, b) => a - b),
    ).toEqual([100, 200, 300]);
    expect(
      table.participants.reduce((sum, entry) => sum + entry.stack, 0),
    ).toBe(600);
    expect(table.history[0].pot).toBe(600);
  });

  test("lets a winner muck their cards for every viewer", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    const one = player("1");
    const two = player("2");
    table.add(one, 2_000);
    table.add(two, 2_000);
    startCashHand(table);

    let guard = 0;
    while (table.phase !== "showdown" && guard++ < 24) {
      if (!table.activePlayerId) {
        table.tick(Date.now() + 1_000);
        continue;
      }
      const active = table.participants.find(
        (entry) => entry.player.id === table.activePlayerId,
      )!;
      table.action(
        active.player.id,
        table.currentBet > active.bet ? "call" : "check",
      );
    }

    const winnerId = table.history[0].winners[0].playerId;
    const otherId = winnerId === one.id ? two.id : one.id;
    table.muck(winnerId);

    for (const viewerId of [winnerId, otherId]) {
      const winner = table
        .snapshot(viewerId)
        .seats.find((seat) => seat.id === winnerId)!;
      expect(winner.mucked).toBe(true);
      expect(winner.cards.every((card) => card.hidden && card.rank === 0)).toBe(
        true,
      );
    }
    expect(table.history[0].winners[0].cards).toHaveLength(0);
  });
});

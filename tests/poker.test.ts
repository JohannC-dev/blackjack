import { describe, expect, test } from "bun:test";
import { evaluatePokerHand, makePokerDeck, PokerTable } from "../server/poker";
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

  test("builds one cryptographically shuffled 52-card deck", () => {
    const deck = makePokerDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.id)).size).toBe(52);
    expect(new Set(deck.map((card) => `${card.rank}-${card.suit}`)).size).toBe(
      52,
    );
  });
});

describe("Poker table authority", () => {
  test("starts heads-up cash automatically and assigns standard blinds", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    table.add(player("1"), 2_000);
    table.add(player("2"), 2_000);
    table.tick(Date.now() + 2_000);
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
    table.tick(Date.now() + 2_000);
    const snapshot = table.snapshot(one.id);
    const mine = snapshot.seats.find((seat) => seat.id === one.id)!;
    const theirs = snapshot.seats.find((seat) => seat.id === two.id)!;
    expect(mine.cards.every((card) => !card.hidden && card.rank > 0)).toBe(
      true,
    );
    expect(theirs.cards.every((card) => card.hidden && card.rank === 0)).toBe(
      true,
    );
  });

  test("rejects out-of-turn actions and awards an uncontested pot", () => {
    const table = new PokerTable("cash", 20, 10, 20, () => {});
    table.add(player("1"), 2_000);
    table.add(player("2"), 2_000);
    table.tick(Date.now() + 2_000);
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
    table.tick(Date.now() + 2_000);
    let guard = 0;
    while (table.phase !== "showdown" && guard++ < 12) {
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
});

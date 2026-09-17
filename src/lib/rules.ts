import type { Card, SideResult } from "./types";

export const SUITS = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
export const rankLabel = (rank: number) =>
  ({ 1: "A", 11: "J", 12: "Q", 13: "K" })[rank] ?? String(rank);
export const isRed = (card: Card) =>
  card.suit === "hearts" || card.suit === "diamonds";
export function score(cards: Card[]) {
  let total = cards.reduce((sum, card) => sum + Math.min(card.rank, 10), 0);
  const soft = cards.some((card) => card.rank === 1) && total + 10 <= 21;
  if (soft) total += 10;
  return { total, soft };
}
export const isBlackjack = (cards: Card[]) =>
  cards.length === 2 && score(cards).total === 21;
export const canSplitCards = (cards: Card[]) =>
  cards.length === 2 &&
  Math.min(cards[0].rank, 10) === Math.min(cards[1].rank, 10);

function result(label: string, odds: number, stake: number): SideResult {
  return { label, odds, payout: stake * (odds + 1) };
}

export function evaluate21Plus3(
  cards: Card[],
  stake: number,
): SideResult | null {
  if (cards.length !== 3 || stake === 0) return null;
  const ranks = cards.map((card) => card.rank).sort((a, b) => a - b);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const trips = ranks[0] === ranks[2];
  const straight =
    new Set(ranks).size === 3 &&
    ((ranks[1] === ranks[0] + 1 && ranks[2] === ranks[1] + 1) ||
      ranks.join() === "1,12,13");
  if (straight && flush) return result("Straight Flush", 9, stake);
  if (trips) return result("Three of a Kind", 9, stake);
  if (straight) return result("Straight", 9, stake);
  if (flush) return result("Flush", 9, stake);
  return null;
}

export function evaluateSuperPairs(
  cards: Card[],
  stake: number,
): SideResult | null {
  if (cards.length !== 3 || stake === 0) return null;
  const [a, b, dealer] = cards;
  if (a.rank !== b.rank) return null;
  if (a.suit === b.suit && a.rank === dealer.rank && a.suit === dealer.suit)
    return result("Suited Trips", 50, stake);
  if (a.suit === b.suit) return result("Suited Pair", 25, stake);
  if (isRed(a) === isRed(b)) return result("Prime Pair", 10, stake);
  return result("Any Pair", 8, stake);
}

export const betTotal = (bet: { main: number; three: number; pairs: number }) =>
  bet.main + bet.three + bet.pairs;
export const credits = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);

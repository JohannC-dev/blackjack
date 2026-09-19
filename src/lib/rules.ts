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

export type PokerHandValue = { score: number[]; label: string };

const POKER_RANKS: Record<number, string> = {
  14: "As",
  13: "Rois",
  12: "Dames",
  11: "Valets",
  10: "Dix",
  9: "Neufs",
  8: "Huits",
  7: "Septs",
  6: "Six",
  5: "Cinq",
  4: "Quatre",
  3: "Trois",
  2: "Deux",
};

export function comparePokerScore(a: number[], b: number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function fiveCardPokerValue(cards: Card[]): PokerHandValue {
  const ranks = cards.map((card) => (card.rank === 1 ? 14 : card.rank));
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  let straightHigh = 0;
  for (let index = 0; index <= unique.length - 5; index++) {
    if (unique[index] - unique[index + 4] === 4) {
      straightHigh = unique[index];
      break;
    }
  }
  if (flush && straightHigh)
    return { score: [8, straightHigh], label: "Quinte flush" };
  if (groups[0][1] === 4)
    return {
      score: [7, groups[0][0], groups.find((group) => group[1] === 1)![0]],
      label: "Carré",
    };
  if (groups[0][1] === 3 && groups[1]?.[1] === 2)
    return { score: [6, groups[0][0], groups[1][0]], label: "Full" };
  if (flush)
    return { score: [5, ...ranks.sort((a, b) => b - a)], label: "Couleur" };
  if (straightHigh) return { score: [4, straightHigh], label: "Quinte" };
  if (groups[0][1] === 3)
    return {
      score: [
        3,
        groups[0][0],
        ...groups.filter((group) => group[1] === 1).map((group) => group[0]),
      ],
      label: "Brelan",
    };
  const pairs = groups.filter((group) => group[1] === 2);
  if (pairs.length >= 2)
    return {
      score: [
        2,
        pairs[0][0],
        pairs[1][0],
        groups.find((group) => group[1] === 1)![0],
      ],
      label: "Deux paires",
    };
  if (pairs.length === 1)
    return {
      score: [
        1,
        pairs[0][0],
        ...groups.filter((group) => group[1] === 1).map((group) => group[0]),
      ],
      label: "Paire",
    };
  return { score: [0, ...ranks.sort((a, b) => b - a)], label: "Carte haute" };
}

export function evaluatePokerHand(cards: Card[]): PokerHandValue {
  if (cards.length < 5) throw new Error("Cinq cartes sont nécessaires.");
  let best: PokerHandValue | null = null;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const candidate = fiveCardPokerValue([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (!best || comparePokerScore(candidate.score, best.score) > 0)
              best = candidate;
          }
  return best!;
}

export function describePokerHand(value: PokerHandValue) {
  const rank = (number: number) => POKER_RANKS[number] ?? String(number);
  switch (value.score[0]) {
    case 8:
      return `Quinte flush, ${rank(value.score[1])} haut`;
    case 7:
      return `Carré de ${rank(value.score[1])}`;
    case 6:
      return `Full, ${rank(value.score[1])} par les ${rank(value.score[2])}`;
    case 5:
      return `Couleur, ${rank(value.score[1])} haut`;
    case 4:
      return `Quinte, ${rank(value.score[1])} haut`;
    case 3:
      return `Brelan de ${rank(value.score[1])}`;
    case 2:
      return `Deux paires, ${rank(value.score[1])} et ${rank(value.score[2])}`;
    case 1:
      return `Paire de ${rank(value.score[1])}`;
    default:
      return `${rank(value.score[1])} haut`;
  }
}

export function describePokerHolding(cards: Card[], community: Card[]) {
  if (cards.length !== 2 || cards.some((card) => card.rank < 1))
    return undefined;
  const allCards = [...cards, ...community];
  if (allCards.length >= 5)
    return describePokerHand(evaluatePokerHand(allCards));
  const first = cards[0].rank === 1 ? 14 : cards[0].rank;
  const second = cards[1].rank === 1 ? 14 : cards[1].rank;
  if (first === second) return `Paire de ${POKER_RANKS[first]}`;
  const short = (rank: number) =>
    ({ 14: "A", 13: "K", 12: "Q", 11: "J" })[rank] ?? String(rank);
  return `${short(Math.max(first, second))} ${short(Math.min(first, second))}${cards[0].suit === cards[1].suit ? " assortis" : ""}`;
}

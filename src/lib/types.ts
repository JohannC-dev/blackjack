export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Card = {
  id: string;
  rank: number;
  suit: Suit;
  /** Present only on the public placeholder for a concealed double card. */
  hidden?: boolean;
};
export type Bet = { main: number; three: number; pairs: number };
export type SideResult = { label: string; odds: number; payout: number };
export type Hand = {
  id: string;
  cards: Card[];
  bet: number;
  status: "playing" | "stood" | "bust" | "blackjack";
  split: boolean;
  splitAces: boolean;
  doubleCardHidden?: boolean;
  result?: "win" | "lose" | "push" | "blackjack";
  payout?: number;
};
export type Seat = {
  index: number;
  playerId: string | null;
  bet: Bet;
  hands: Hand[];
  sides: { three: SideResult | null; pairs: SideResult | null };
  committed: number;
};
export type PublicPlayer = {
  id: string;
  name: string;
  balance: number;
  connected: boolean;
  ready: boolean;
};
export type HistoryItem = {
  round: number;
  playerId: string;
  net: number;
  timestamp: number;
};
export type TableState = {
  id: string;
  phase: "betting" | "dealing" | "bonuses" | "playing" | "dealer" | "settled";
  round: number;
  players: PublicPlayer[];
  seats: Seat[];
  dealer: Card[];
  activeHandId: string | null;
  deadline: number | null;
  history: HistoryItem[];
  shoeRemaining: number;
  message: string;
};
export type Profile = { token: string; name: string; balance: number };
export type Command =
  | { type: "claim"; seat: number }
  | { type: "release"; seat: number }
  | { type: "bet"; seat: number; bet: Bet }
  | { type: "ready"; ready: boolean }
  | { type: "hit" | "stand" | "split"; handId: string }
  | { type: "double"; handId: string; reveal?: "now" | "dealer" }
  | { type: "refill" };
export type Ack =
  | { ok: true; playerId?: string; tableId?: string }
  | { ok: false; error: string };

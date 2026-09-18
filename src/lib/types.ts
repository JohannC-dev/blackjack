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
export type GambleColor = "red" | "black";
export type GambleResult = "win" | "lose";
export type GambleState = {
  playerId: string;
  /** Round whose positive result created this gamble opportunity. */
  round: number;
  /** The current winnings amount at risk in the next draw. */
  stake: number;
  choice: GambleColor | null;
  card: Card | null;
  result: GambleResult | null;
  status: "available" | "lost" | "cashed";
  streak: number;
};
export type HistoryGamble = {
  stake: number;
  choice: GambleColor;
  card: Card;
  result: GambleResult;
  net: number;
};
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
export type HistoryBetType = keyof Bet;
export type HistoryBetResult = "win" | "lose" | "push" | "blackjack" | "none";
export type HistoryBet = {
  /** Which of the three betting areas produced this line. */
  type: HistoryBetType;
  /** Seat where the wager was placed. */
  seat: number;
  /** Amount committed to this wager (including a double or split for main bets). */
  bet: number;
  /** Amount returned to the player's balance for this wager. */
  payout: number;
  /** Payout minus the amount committed. */
  net: number;
  result: HistoryBetResult;
  /** Winning side-bet combination, when applicable. */
  label?: string;
};
export type HistoryItem = {
  round: number;
  playerId: string;
  net: number;
  timestamp: number;
  /** One line per blackjack hand and one line for each side bet. */
  bets: HistoryBet[];
  /** Each red/black draw made with the winnings after this round. */
  gambles?: HistoryGamble[];
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
  gambles: GambleState[];
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
  | { type: "gamble"; color: GambleColor }
  | { type: "cashout" }
  | { type: "refill" };
export type Ack =
  | { ok: true; playerId?: string; tableId?: string }
  | { ok: false; error: string };

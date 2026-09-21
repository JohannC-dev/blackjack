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
  /** Last wager that actually entered a round, used by the rebet action. */
  previousBet: Bet | null;
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
  phase:
    | "shuffling"
    | "betting"
    | "dealing"
    | "bonuses"
    | "playing"
    | "dealer"
    | "settled";
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
  | { type: "repeat" }
  | { type: "ready"; ready: boolean }
  | { type: "hit" | "stand" | "split"; handId: string }
  | { type: "double"; handId: string; reveal?: "now" | "dealer" }
  | { type: "gamble"; color: GambleColor }
  | { type: "cashout" }
  | { type: "refill" };
export type Ack =
  | { ok: true; playerId?: string; tableId?: string }
  | { ok: false; error: string };

export type PokerMode = "cash" | "spin";
export type PokerPhase =
  | "waiting"
  | "spinning"
  | "shuffling"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "complete";
export type PokerAction = "fold" | "check" | "call" | "raise" | "all-in";

export type PokerSeat = {
  id: string;
  name: string;
  seat: number;
  stack: number;
  bet: number;
  committed: number;
  connected: boolean;
  status: "waiting" | "active" | "folded" | "all-in" | "out";
  cards: Card[];
  /** The player chose not to keep their winning hole cards face up. */
  mucked?: boolean;
  handLabel?: string;
  lastAction?: string;
};

export type PokerHistoryItem = {
  hand: number;
  community: Card[];
  pot: number;
  winners: {
    playerId: string;
    name: string;
    amount: number;
    label: string;
    cards: Card[];
    mucked?: boolean;
  }[];
  timestamp: number;
};

export type PokerChatMessage = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  timestamp: number;
};

export type PokerTableState = {
  id: string;
  mode: PokerMode;
  stake: number;
  smallBlind: number;
  bigBlind: number;
  phase: PokerPhase;
  hand: number;
  seats: PokerSeat[];
  community: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  button: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  activePlayerId: string | null;
  deadline: number | null;
  /** End of the short window where an uncontested winner may show their cards. */
  revealDeadline: number | null;
  wheelMultiplier: number | null;
  wheelSpinning: boolean;
  history: PokerHistoryItem[];
  chat: PokerChatMessage[];
  message: string;
};

export type PokerClientState = {
  status: "lobby" | "queue" | "table";
  balance: number;
  queue?: { mode: PokerMode; stake: number; waiting: number };
  table?: PokerTableState;
};

export type PokerCommand =
  | { type: "match"; mode: PokerMode; stake: number; buyIn?: number }
  | { type: "leave" }
  | { type: "action"; action: PokerAction; amount?: number }
  | { type: "muck" }
  | { type: "show" }
  | { type: "chat"; text: string };

export type TowerDifficulty = "easy" | "normal" | "hard" | "impossible";
export type TowerCell = "safe" | "trap" | "gold";
export type TowerStatus = "playing" | "lost" | "cashed" | "topped";

export type TowerRow = {
  /** Column chosen by the player on this floor, if the floor was reached. */
  picked: number | null;
  /** Revealed only once the floor is decided or the climb is over. */
  cells: TowerCell[] | null;
};

export type TowerRun = {
  id: string;
  difficulty: TowerDifficulty;
  cols: number;
  bet: number;
  /** Number of floors cleared, 0 to 10. */
  floor: number;
  status: TowerStatus;
  lucky: boolean;
  rows: TowerRow[];
  payout: number;
  startedAt: number;
};

export type TowerGhost = {
  id: string;
  playerId: string;
  name: string;
  difficulty: TowerDifficulty;
  cols: number;
  floor: number;
  status: TowerStatus;
  lucky: boolean;
  payout: number;
};

export type TowerFeedItem = {
  id: string;
  name: string;
  status: Exclude<TowerStatus, "playing">;
  difficulty: TowerDifficulty;
  floor: number;
  lucky: boolean;
  amount: number;
  timestamp: number;
};

export type TowerHistoryItem = {
  id: string;
  difficulty: TowerDifficulty;
  floor: number;
  status: Exclude<TowerStatus, "playing">;
  lucky: boolean;
  bet: number;
  payout: number;
  timestamp: number;
};

export type TowerPublicState = {
  jackpot: number;
  ghosts: TowerGhost[];
  feed: TowerFeedItem[];
};

export type TowerClientState = TowerPublicState & {
  balance: number;
  run: TowerRun | null;
  history: TowerHistoryItem[];
};

export type TowerCommand =
  | { type: "start"; difficulty: TowerDifficulty; bet: number }
  | { type: "pick"; column: number }
  | { type: "cashout" };

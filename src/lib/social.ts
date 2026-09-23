/** Shared vocabulary of the social layer, used by the server and the client. */

export const FRIEND_CODE_LENGTH = 8;
/** No 0/O or 1/I: a code must survive being read aloud or copied by hand. */
export const FRIEND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Keeps the letters and digits of what the player typed, e.g. "abcd-efgh". */
export function normalizeFriendCode(input: string) {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === FRIEND_CODE_LENGTH ? code : null;
}

/** ABCDEFGH → ABCD-EFGH */
export function formatFriendCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** How the viewer stands with another player. */
export type Relation = "self" | "friend" | "incoming" | "outgoing" | "none";

export type SocialPlayer = {
  id: string;
  name: string;
  friendCode: string | null;
};

export type Friend = SocialPlayer & {
  /** ISO date the friendship was accepted. */
  since: string;
  online: boolean;
};

export type FriendRequest = {
  id: string;
  player: SocialPlayer;
  createdAt: string;
};

export type SocialOverview = {
  me: SocialPlayer;
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

export type PlayerSearchResult = SocialPlayer & {
  relation: Relation;
  /** Pending request between the two players, if any. */
  requestId: string | null;
};

/**
 * Who may read a part of a profile. A player is always allowed to see their
 * own, whatever they picked.
 */
export type Audience = "public" | "friends" | "private";

export const AUDIENCES: readonly Audience[] = ["public", "friends", "private"];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  public: "Tout le monde",
  friends: "Mes amis",
  private: "Personne",
};

export function isAudience(value: unknown): value is Audience {
  return AUDIENCES.includes(value as Audience);
}

/**
 * The two dials a player turns: one for the profile as a whole, one for the
 * money. Parrainage is never in here — it stays private, always.
 */
export type ProfileVisibility = {
  profile: Audience;
  earnings: Audience;
};

/** Gains stay hidden unless the player opens them up. */
export const DEFAULT_VISIBILITY: ProfileVisibility = {
  profile: "public",
  earnings: "friends",
};

export function allows(audience: Audience, relation: Relation) {
  if (relation === "self") return true;
  if (audience === "public") return true;
  return audience === "friends" && relation === "friend";
}

/** The games a profile reports on, in the order the profile lists them. */
export const STAT_GAMES = [
  "blackjack",
  "roulette",
  "poker",
  "tower",
  "mines",
  "chicken",
] as const;

export type StatGame = (typeof STAT_GAMES)[number];

export const STAT_GAME_LABELS: Record<StatGame, string> = {
  blackjack: "Blackjack",
  roulette: "Roulette",
  poker: "Poker",
  tower: "La Tower",
  mines: "Jeu de la mine",
  chicken: "Chicken",
};

export function isStatGame(value: string): value is StatGame {
  return (STAT_GAMES as readonly string[]).includes(value);
}

/** What a player did in one game. Amounts are in credits. */
export type GameStats = {
  game: StatGame;
  /** Rounds, runs or buy-ins that reached a result. */
  played: number;
  /** Results in the player's favour, out of `played`. */
  won: number;
  bestWin: number;
  /** Hidden with the earnings. */
  earnings: GameEarnings | null;
};

export type GameEarnings = {
  wagered: number;
  net: number;
  /** A positive number: the worst single result. */
  worstLoss: number;
};

/** The headline of a profile, summed over every game. */
export type StatsSummary = {
  played: number;
  won: number;
  bestWin: number;
  /** The most played game, or null before the first round. */
  favouriteGame: StatGame | null;
  earnings: GameEarnings | null;
};

export type PlayerStats = {
  summary: StatsSummary;
  /** Only the games the player has actually touched. */
  games: GameStats[];
};

export type PlayerProfile = SocialPlayer & {
  memberSince: string;
  relation: Relation;
  requestId: string | null;
  online: boolean;
  friends: number;
  /** Null when the player keeps their profile to themselves. */
  stats: PlayerStats | null;
  /** Reserved for guilds; always null until they exist. */
  guild: null;
  /** Only ever sent to the player themselves, to fill the settings. */
  visibility: ProfileVisibility | null;
};

/** Games a friend can be invited to. */
export type InviteGame =
  "blackjack" | "roulette" | "poker" | "tower" | "mines" | "chicken";

export const INVITE_GAME_LABELS: Record<InviteGame, string> = {
  blackjack: "Blackjack",
  roulette: "Roulette",
  poker: "Poker",
  tower: "La Tower",
  mines: "Jeu de la mine",
  chicken: "Chicken",
};

/**
 * Invitation to join a game, relayed live between two friends. It is never
 * stored: it disappears with the connections.
 */
export type GameInvite = {
  id: string;
  from: { id: string; name: string };
  game: InviteGame;
  tableId: string | null;
  private: boolean;
  sentAt: number;
};

export type GameInviteReply = {
  inviteId: string;
  by: { id: string; name: string };
  accepted: boolean;
};

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

export type PlayerProfile = SocialPlayer & {
  memberSince: string;
  relation: Relation;
  requestId: string | null;
  online: boolean;
  friends: number;
};

/** Games a friend can be invited to. */
export type InviteGame = "blackjack" | "roulette" | "poker" | "tower" | "mines";

export const INVITE_GAME_LABELS: Record<InviteGame, string> = {
  blackjack: "Blackjack",
  roulette: "Roulette",
  poker: "Poker",
  tower: "La Tower",
  mines: "Jeu de la mine",
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

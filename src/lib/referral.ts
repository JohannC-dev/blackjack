/** Shared vocabulary of the parrainage, used by the server and the client. */

import { INITIAL_CREDIT_BALANCE } from "./chips";
import type { OwnedCosmetic } from "./cosmetics";
import type { SocialPlayer } from "./social";

/** Field carrying the parrainage code in the sign-up request. */
export const REFERRAL_CODE_FIELD = "referralCode";

/** A filleul starts with half again the usual bankroll. */
export const REFERRAL_WELCOME_RATE = 0.5;

/** Credits granted on top of the usual opening balance. */
export const REFERRAL_WELCOME_BONUS = Math.round(
  INITIAL_CREDIT_BALANCE * REFERRAL_WELCOME_RATE,
);

export const REFERRAL_WELCOME_BALANCE =
  INITIAL_CREDIT_BALANCE + REFERRAL_WELCOME_BONUS;

export type ReferralTier = {
  /** 1 to 5, in order. */
  readonly tier: number;
  /** Filleuls needed to reach it. */
  readonly filleuls: number;
  readonly reward: number;
  readonly label: string;
};

/** The five parrain tiers. Reaching one grants its credits, once and for all. */
export const REFERRAL_TIERS: readonly ReferralTier[] = [
  { tier: 1, filleuls: 1, reward: 250_000, label: "Premier filleul" },
  { tier: 2, filleuls: 3, reward: 500_000, label: "Petite table" },
  { tier: 3, filleuls: 5, reward: 1_000_000, label: "Cercle" },
  { tier: 4, filleuls: 10, reward: 2_500_000, label: "Salon privé" },
  { tier: 5, filleuls: 25, reward: 5_000_000, label: "Maître de nuit" },
];

/** Tier that also unlocks the parrainage cosmetics for the parrain. */
export const REFERRAL_COSMETIC_TIER = 1;

export const REFERRAL_TIER_COUNT = REFERRAL_TIERS.length;

export function tiersReachedBy(filleuls: number) {
  return REFERRAL_TIERS.filter((tier) => filleuls >= tier.filleuls);
}

export function nextTierAfter(filleuls: number) {
  return REFERRAL_TIERS.find((tier) => filleuls < tier.filleuls) ?? null;
}

export type ReferralTierState = ReferralTier & {
  reached: boolean;
  /** ISO date the credits were granted, null while unreached. */
  grantedAt: string | null;
};

/** A filleul of the viewer, with the activity their parrain may see. */
export type Filleul = SocialPlayer & {
  /** ISO date the filleul signed up with the code. */
  joinedAt: string;
  online: boolean;
  /** Rounds, runs and buy-ins across every game. */
  played: number;
  wagered: number;
};

export type ReferralOverview = {
  /** The player's own code, the one they hand out. Same as the friend code. */
  code: string | null;
  /** Who parrained the player, when someone did. */
  parrain: (SocialPlayer & { since: string }) | null;
  filleuls: Filleul[];
  tiers: ReferralTierState[];
  /** Credits already granted by the tiers. */
  earned: number;
  /** Filleuls still needed for the next tier, null once all are reached. */
  nextTier: ReferralTier | null;
  cosmetics: OwnedCosmetic[];
};

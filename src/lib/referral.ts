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
  /** Credits wagered by one filleul to reach it. */
  readonly wagered: number;
  readonly reward: number;
  readonly label: string;
};

/** The five tiers apply independently to every filleul. */
export const REFERRAL_TIERS: readonly ReferralTier[] = [
  { tier: 1, wagered: 2_000_000, reward: 250_000, label: "Mise de départ" },
  { tier: 2, wagered: 10_000_000, reward: 500_000, label: "Petite table" },
  { tier: 3, wagered: 50_000_000, reward: 1_000_000, label: "Cercle" },
  { tier: 4, wagered: 100_000_000, reward: 2_500_000, label: "Salon privé" },
  { tier: 5, wagered: 500_000_000, reward: 5_000_000, label: "Maître de nuit" },
];

/** Tier that also unlocks the parrainage cosmetics for the parrain. */
export const REFERRAL_COSMETIC_TIER = 1;

export const REFERRAL_TIER_COUNT = REFERRAL_TIERS.length;

export function tiersReachedBy(wagered: number) {
  return REFERRAL_TIERS.filter((tier) => wagered >= tier.wagered);
}

export function nextTierAfter(wagered: number) {
  return REFERRAL_TIERS.find((tier) => wagered < tier.wagered) ?? null;
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
  tiers: ReferralTierState[];
  nextTier: ReferralTier | null;
};

export type ReferralOverview = {
  /** The player's own code, the one they hand out. Same as the friend code. */
  code: string | null;
  /** Who parrained the player, when someone did. */
  parrain: (SocialPlayer & { since: string }) | null;
  filleuls: Filleul[];
  /** Credits already granted across all filleuls. */
  earned: number;
  cosmetics: OwnedCosmetic[];
};

import type { ReferralTier } from "../../src/lib/referral";

/**
 * A parrainage that just completed. The sign-up hook cannot reach the Socket.IO
 * server directly, so it announces the event here and the club relays it to the
 * parrain when they are connected.
 */
export type ReferralCompleted = {
  readonly parrainId: string;
  readonly filleul: { readonly id: string; readonly name: string };
  /** Tiers the parrain reached with this filleul, possibly none. */
  readonly tiers: readonly ReferralTier[];
};

let listener: ((event: ReferralCompleted) => void) | null = null;

/** The club listens once, at start-up. */
export function onReferralCompleted(next: (event: ReferralCompleted) => void) {
  listener = next;
}

export function announceReferral(event: ReferralCompleted) {
  try {
    listener?.(event);
  } catch (error) {
    console.error("Parrainage · annonce", error);
  }
}

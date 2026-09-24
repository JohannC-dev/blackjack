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

/**
 * Tiers just granted to a parrain because one of their filleuls kept playing.
 * The credits are already in the database; the club refreshes the parrain's
 * wallet so the balance moves without waiting for a reconnection.
 */
export type TiersGranted = {
  readonly parrainId: string;
  readonly filleulId: string;
  readonly tiers: readonly ReferralTier[];
};

let tierListener: ((event: TiersGranted) => void) | null = null;

/** The club listens once, at start-up. */
export function onTiersGranted(next: (event: TiersGranted) => void) {
  tierListener = next;
}

export function announceTiers(event: TiersGranted) {
  try {
    tierListener?.(event);
  } catch (error) {
    console.error("Parrainage · paliers", error);
  }
}

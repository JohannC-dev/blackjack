"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReferralOverview } from "./referral";

export class ReferralApiError extends Error {}

async function loadOverview(signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch("/api/referrals", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (failure) {
    // Let the hook distinguish an effect cleanup from an actual network error.
    if (signal?.aborted) throw failure;
    throw new ReferralApiError("Le club ne répond pas.");
  }
  const body = (await response.json().catch(() => null)) as
    | (ReferralOverview & { error?: string })
    | null;
  if (!response.ok)
    throw new ReferralApiError(body?.error ?? "Une erreur est survenue.");
  return body as ReferralOverview;
}

/**
 * Loads the parrainage panel of the signed-in player. `version` reloads it
 * when a filleul arrives or a tier is granted.
 */
export function useReferralOverview(enabled: boolean, version = 0) {
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    setError(null);
    loadOverview(controller.signal).then(
      (loaded) => {
        if (active) {
          setOverview(loaded);
          setError(null);
        }
      },
      (failure: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "Parrainage indisponible.",
        );
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, version, reloads]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);
  return { overview, error, reload };
}

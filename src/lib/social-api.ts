"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  PlayerProfile,
  PlayerSearchResult,
  SocialOverview,
} from "./social";

export class SocialApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "include",
      cache: "no-store",
      ...init,
      headers: init?.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init?.headers,
    });
  } catch (failure) {
    if (init?.signal?.aborted) throw failure;
    throw new SocialApiError("Le club ne répond pas.");
  }
  const body = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok)
    throw new SocialApiError(body?.error ?? "Une erreur est survenue.");
  return body as T;
}

export const socialApi = {
  overview: () => request<SocialOverview>("/api/friends"),
  /** Looks up the owner of a complete friend code. */
  findByCode: (code: string, signal?: AbortSignal) =>
    request<{ player: PlayerSearchResult | null }>(
      `/api/friends/search?code=${encodeURIComponent(code)}`,
      { signal },
    ).then((body) => body.player),
  sendRequest: (target: { userId: string } | { code: string }) =>
    request<{ ok: true; accepted: boolean }>("/api/friends/requests", {
      method: "POST",
      body: JSON.stringify(target),
    }),
  respond: (requestId: string, accept: boolean) =>
    request<{ ok: true }>(
      `/api/friends/requests/${encodeURIComponent(requestId)}/${accept ? "accept" : "decline"}`,
      { method: "POST", body: "{}" },
    ),
  /** Removes a friend or cancels a pending request. */
  remove: (userId: string) =>
    request<{ ok: true }>(`/api/friends/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),
  player: (playerId: string, signal?: AbortSignal) =>
    request<PlayerProfile>(`/api/players/${encodeURIComponent(playerId)}`, {
      signal,
    }),
};

/**
 * Loads a player profile. Shared by the profile dialog and, later, the
 * profile page.
 */
export function usePlayerProfile(playerId: string | null, version = 0) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!playerId) {
      setProfile(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setError(null);
    socialApi.player(playerId, controller.signal).then(
      (loaded) => {
        if (active) setProfile(loaded);
      },
      (failure: unknown) => {
        if (active && !controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "Profil indisponible.",
          );
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [playerId, version, reloads]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);
  return {
    profile: profile?.id === playerId ? profile : null,
    error,
    reload,
  };
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useProfile } from "./profile-context";
import type {
  Collection,
  CosmeticKind,
  EquippedLookup,
  EquippedSkins,
} from "./cosmetics";

export class CosmeticsApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "include",
      cache: "no-store",
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new CosmeticsApiError("Le club ne répond pas.");
  }
  const body = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok)
    throw new CosmeticsApiError(body?.error ?? "Une erreur est survenue.");
  return body as T;
}

export const cosmeticsApi = {
  collection: () => request<Collection>("/api/cosmetics"),
  /** Wears an owned skin, or the Classique with null. */
  equip: (kind: CosmeticKind, cosmeticId: string | null) =>
    request<EquippedSkins>(
      `/api/cosmetics/equipped/${encodeURIComponent(kind)}`,
      { method: "PUT", body: JSON.stringify({ cosmeticId }) },
    ),
  equipped: (userIds: readonly string[]) =>
    request<EquippedLookup>(
      `/api/cosmetics/equipped?users=${userIds.map(encodeURIComponent).join(",")}`,
    ),
};

/*
 * What other players wear, shared by every avatar and table on the page.
 * Lookups made in the same tick travel in one request.
 */

/** Another player's new skin shows up within this delay outside tables. */
const STALE_AFTER_MS = 60_000;
/** Matches the server limit of one lookup. */
const BATCH_SIZE = 50;

type Entry = { skins: EquippedSkins; at: number };

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let queued = new Set<string>();
let flushing: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function isFresh(entry: Entry | undefined) {
  return !!entry && Date.now() - entry.at < STALE_AFTER_MS;
}

async function flush() {
  const ids = [...queued];
  queued = new Set();
  flushing = null;
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const chunk = ids.slice(start, start + BATCH_SIZE);
    try {
      const lookup = await cosmeticsApi.equipped(chunk);
      for (const id of chunk)
        cache.set(id, { skins: lookup[id] ?? {}, at: Date.now() });
    } catch {
      // Classique for now; asked again once the entry goes stale.
      for (const id of chunk)
        if (!cache.has(id)) cache.set(id, { skins: {}, at: Date.now() });
    }
  }
  emit();
}

function fetchEquipped(ids: readonly string[]) {
  for (const id of ids) queued.add(id);
  flushing ??= new Promise((resolve) => setTimeout(resolve, 20)).then(flush);
  return flushing;
}

/** Equipment of these players; `fresh` skips the cache, e.g. on a new round. */
export async function loadEquipped(
  ids: readonly string[],
  fresh = false,
): Promise<EquippedLookup> {
  const missing = ids.filter((id) => fresh || !isFresh(cache.get(id)));
  if (missing.length) await fetchEquipped(missing);
  const lookup: EquippedLookup = {};
  for (const id of ids) lookup[id] = cache.get(id)?.skins ?? {};
  return lookup;
}

/** Records the player's own choice at once, without asking the server. */
export function rememberEquipped(userId: string, skins: EquippedSkins) {
  cache.set(userId, { skins, at: Date.now() });
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What one player wears; undefined while unknown. */
export function useEquippedSkins(userId: string | null | undefined) {
  const skins = useSyncExternalStore(
    subscribe,
    () => (userId ? cache.get(userId)?.skins : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (userId && !isFresh(cache.get(userId))) void fetchEquipped([userId]);
  }, [userId, skins]);
  return skins;
}

/** What the signed-in player wears, live. */
export function useMySkins() {
  return useEquippedSkins(useProfile().profile?.token);
}

/**
 * What the players of a table wear, frozen for the round: read again when
 * the round changes, and only completed when someone sits down mid-round.
 */
export function useTableSkins(ids: readonly string[], roundKey: unknown) {
  const [snapshot, setSnapshot] = useState<EquippedLookup>({});
  const lastRound = useRef<unknown>(undefined);
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");

  useEffect(() => {
    const players = key ? key.split(",") : [];
    const newRound = lastRound.current !== roundKey;
    lastRound.current = roundKey;
    let active = true;
    void loadEquipped(players, newRound).then((lookup) => {
      if (!active) return;
      setSnapshot((previous) => {
        if (newRound) return lookup;
        const next = { ...previous };
        for (const id of players) next[id] ??= lookup[id] ?? {};
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [key, roundKey]);

  return snapshot;
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import type { PgDrizzle } from "@effect/sql-drizzle/Pg";
import type { SqlClient } from "@effect/sql/SqlClient";
import { Effect, Either, Schema } from "effect";
import type {
  PlayerProfile,
  PlayerSearchResult,
  ProfileVisibility,
  SocialOverview,
} from "../../src/lib/social";
import { auth } from "../auth";
import { runDatabase } from "../db/client";
import { HttpError, assertSameOrigin, readJson, send } from "../http";
import {
  SocialError,
  ensurePlayerProfile,
  findPlayerByCode,
  playerProfileFor,
  removeFriendship,
  respondToFriendRequest,
  sendFriendRequest,
  setProfileVisibility,
  socialOverview,
} from "./repository";

export type SocialHttpDeps = {
  /** Whether the player has at least one live connection to the club. */
  readonly isOnline: (userId: string) => boolean;
  /** Tells these players that their friends or requests changed. */
  readonly notify: (userIds: readonly string[]) => void;
};

const Id = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64));
const RequestBody = Schema.Union(
  Schema.Struct({ userId: Id }),
  Schema.Struct({ code: Schema.String.pipe(Schema.maxLength(16)) }),
);
const AudienceValue = Schema.Literal("public", "friends", "private");
const VisibilityBody = Schema.Struct({
  profile: AudienceValue,
  earnings: AudienceValue,
});

/** Runs a database effect; refusals become HTTP errors. */
async function run<A, E>(effect: Effect.Effect<A, E, PgDrizzle | SqlClient>) {
  const result = await runDatabase(Effect.either(effect));
  if (Either.isRight(result)) return result.right;
  const error = result.left;
  if (error instanceof SocialError)
    throw new HttpError(error.status, error.message);
  throw error;
}

/**
 * Serves the /api/friends and /api/players routes. Returns false when the
 * request belongs to another handler.
 */
export async function handleSocialRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: SocialHttpDeps,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://club");
  const path = url.pathname.replace(/\/+$/, "");
  if (
    path !== "/api/friends" &&
    !path.startsWith("/api/friends/") &&
    !path.startsWith("/api/players/")
  )
    return false;
  const method = req.method ?? "GET";

  try {
    let parts: string[];
    try {
      parts = path.split("/").slice(2).map(decodeURIComponent);
    } catch {
      throw new HttpError(400, "Adresse invalide.");
    }
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) throw new HttpError(401, "Non authentifié.");
    const me = session.user.id;
    if (method !== "GET") assertSameOrigin(req);

    // GET /api/friends
    if (method === "GET" && parts.length === 1 && parts[0] === "friends") {
      const friendCode = await run(ensurePlayerProfile(me));
      const overview = await run(socialOverview(me));
      send(res, 200, {
        me: { id: me, name: session.user.name, friendCode },
        friends: overview.friends.map((friend) => ({
          ...friend,
          online: deps.isOnline(friend.id),
        })),
        incoming: overview.incoming,
        outgoing: overview.outgoing,
      } satisfies SocialOverview);
      return true;
    }

    // GET /api/friends/search?code= (a complete friend code only)
    if (method === "GET" && parts[0] === "friends" && parts[1] === "search") {
      const player = await run(
        findPlayerByCode(me, url.searchParams.get("code") ?? ""),
      );
      send(res, 200, { player } satisfies {
        player: PlayerSearchResult | null;
      });
      return true;
    }

    // POST /api/friends/requests
    if (
      method === "POST" &&
      parts[0] === "friends" &&
      parts[1] === "requests" &&
      parts.length === 2
    ) {
      const body = Schema.decodeUnknownEither(RequestBody)(await readJson(req));
      if (Either.isLeft(body)) throw new HttpError(400, "Demande invalide.");
      const result = await run(sendFriendRequest(me, body.right));
      deps.notify([me, result.targetId]);
      send(res, 200, { ok: true, accepted: result.accepted });
      return true;
    }

    // POST /api/friends/requests/:id/accept|decline
    if (
      method === "POST" &&
      parts[0] === "friends" &&
      parts[1] === "requests" &&
      parts.length === 4 &&
      (parts[3] === "accept" || parts[3] === "decline")
    ) {
      const result = await run(
        respondToFriendRequest(me, parts[2]!, parts[3] === "accept"),
      );
      deps.notify([me, result.requesterId]);
      send(res, 200, { ok: true });
      return true;
    }

    // DELETE /api/friends/:userId (removes a friend or cancels a request)
    if (method === "DELETE" && parts[0] === "friends" && parts.length === 2) {
      await run(removeFriendship(me, parts[1]!));
      deps.notify([me, parts[1]!]);
      send(res, 200, { ok: true });
      return true;
    }

    // PATCH /api/players/me/visibility
    if (
      method === "PATCH" &&
      parts[0] === "players" &&
      parts[1] === "me" &&
      parts[2] === "visibility" &&
      parts.length === 3
    ) {
      const body = Schema.decodeUnknownEither(VisibilityBody)(
        await readJson(req),
      );
      if (Either.isLeft(body))
        throw new HttpError(400, "Réglage de visibilité invalide.");
      const visibility = await run(setProfileVisibility(me, body.right));
      send(res, 200, visibility satisfies ProfileVisibility);
      return true;
    }

    // GET /api/players/:id
    if (method === "GET" && parts[0] === "players" && parts.length === 2) {
      const profile = await run(playerProfileFor(me, parts[1]!));
      send(res, 200, {
        ...profile,
        online: deps.isOnline(profile.id),
      } satisfies PlayerProfile);
      return true;
    }

    throw new HttpError(404, "Route introuvable.");
  } catch (error) {
    if (error instanceof HttpError)
      send(res, error.status, { error: error.message });
    else {
      console.error("Amis ·", error);
      send(res, 503, { error: "Les amis sont temporairement indisponibles." });
    }
    return true;
  }
}

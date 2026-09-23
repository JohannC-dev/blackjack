import { randomInt, randomUUID } from "node:crypto";
import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import {
  allows,
  DEFAULT_VISIBILITY,
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  isAudience,
  normalizeFriendCode,
  type FriendRequest,
  type PlayerProfile,
  type PlayerSearchResult,
  type PlayerStats,
  type ProfileVisibility,
  type Relation,
  type SocialPlayer,
} from "../../src/lib/social";
import { statsFor } from "../db/player-stats";
import { friendship, playerProfile, user } from "../db/schema";

const MAX_FRIENDS = 200;
const MAX_OUTGOING_REQUESTS = 50;

/** A refusal the player can act on. */
export class SocialError extends Data.TaggedError("SocialError")<{
  readonly message: string;
  readonly status: 400 | 404 | 409;
}> {}

export class SocialDatabaseError extends Data.TaggedError(
  "SocialDatabaseError",
)<{ readonly cause: unknown }> {
  override get message() {
    return "Les amis sont temporairement indisponibles.";
  }
}

const mapDatabaseError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.mapError(effect, (cause) =>
    cause instanceof SocialError || cause instanceof SocialDatabaseError
      ? cause
      : new SocialDatabaseError({ cause }),
  );

function newFriendCode() {
  let code = "";
  for (let index = 0; index < FRIEND_CODE_LENGTH; index++)
    code += FRIEND_CODE_ALPHABET[randomInt(FRIEND_CODE_ALPHABET.length)];
  return code;
}

type FriendshipRow = typeof friendship.$inferSelect;

function otherPlayer(row: FriendshipRow, userId: string) {
  return row.requesterId === userId ? row.addresseeId : row.requesterId;
}

function relationOf(row: FriendshipRow | undefined, userId: string): Relation {
  if (!row) return "none";
  if (row.status === "accepted") return "friend";
  return row.requesterId === userId ? "outgoing" : "incoming";
}

/** Gives the player a friend code and visibility dials the first time. */
export const ensureProfileRow = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    for (let attempt = 0; attempt < 8; attempt++) {
      const [existing] = yield* db
        .select({
          friendCode: playerProfile.friendCode,
          visibility: playerProfile.visibility,
          earningsVisibility: playerProfile.earningsVisibility,
        })
        .from(playerProfile)
        .where(eq(playerProfile.userId, userId))
        .limit(1);
      if (existing)
        return {
          friendCode: existing.friendCode,
          // A hand-edited row must not open a profile the player closed.
          visibility: {
            profile: isAudience(existing.visibility)
              ? existing.visibility
              : DEFAULT_VISIBILITY.profile,
            earnings: isAudience(existing.earningsVisibility)
              ? existing.earningsVisibility
              : DEFAULT_VISIBILITY.earnings,
          } satisfies ProfileVisibility,
        };
      // A code already taken by someone else leaves no row: draw again.
      yield* db
        .insert(playerProfile)
        .values({ userId, friendCode: newFriendCode() })
        .onConflictDoNothing();
    }
    return yield* Effect.die("No free friend code after 8 attempts");
  }).pipe(mapDatabaseError);

export const ensurePlayerProfile = (userId: string) =>
  Effect.map(ensureProfileRow(userId), (row) => row.friendCode);

/** Saves the two dials. Parrainage is not one of them: it is never shared. */
export const setProfileVisibility = (
  userId: string,
  visibility: ProfileVisibility,
) =>
  Effect.gen(function* () {
    yield* ensureProfileRow(userId);
    const db = yield* PgDrizzle;
    yield* db
      .update(playerProfile)
      .set({
        visibility: visibility.profile,
        earningsVisibility: visibility.earnings,
        updatedAt: new Date(),
      })
      .where(eq(playerProfile.userId, userId));
    return visibility;
  }).pipe(mapDatabaseError);

const playersById = (ids: readonly string[]) =>
  Effect.gen(function* () {
    if (!ids.length) return new Map<string, SocialPlayer>();
    const db = yield* PgDrizzle;
    const rows = yield* db
      .select({
        id: user.id,
        name: user.name,
        friendCode: playerProfile.friendCode,
      })
      .from(user)
      .leftJoin(playerProfile, eq(playerProfile.userId, user.id))
      .where(inArray(user.id, [...ids]));
    return new Map(rows.map((row) => [row.id, row]));
  });

const pairOf = (userId: string, otherId: string) =>
  or(
    and(
      eq(friendship.requesterId, userId),
      eq(friendship.addresseeId, otherId),
    ),
    and(
      eq(friendship.requesterId, otherId),
      eq(friendship.addresseeId, userId),
    ),
  );

const findPair = (userId: string, otherId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const [row] = yield* db
      .select()
      .from(friendship)
      .where(pairOf(userId, otherId))
      .limit(1);
    return row;
  });

/** Friends, received requests and sent requests of a player. */
export const socialOverview = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const rows = yield* db
      .select()
      .from(friendship)
      .where(
        or(
          eq(friendship.requesterId, userId),
          eq(friendship.addresseeId, userId),
        ),
      )
      .orderBy(asc(friendship.createdAt));
    const players = yield* playersById(
      rows.map((row) => otherPlayer(row, userId)),
    );
    const friends: Array<SocialPlayer & { since: string }> = [];
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];
    for (const row of rows) {
      const player = players.get(otherPlayer(row, userId));
      if (!player) continue;
      if (row.status === "accepted")
        friends.push({
          ...player,
          since: (row.respondedAt ?? row.createdAt).toISOString(),
        });
      else
        (row.requesterId === userId ? outgoing : incoming).push({
          id: row.id,
          player,
          createdAt: row.createdAt.toISOString(),
        });
    }
    friends.sort((left, right) => left.name.localeCompare(right.name, "fr"));
    incoming.reverse();
    outgoing.reverse();
    return { friends, incoming, outgoing };
  }).pipe(mapDatabaseError);

/** Ids of the accepted friends of a player. */
export const friendIdsOf = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const rows = yield* db
      .select()
      .from(friendship)
      .where(
        and(
          eq(friendship.status, "accepted"),
          or(
            eq(friendship.requesterId, userId),
            eq(friendship.addresseeId, userId),
          ),
        ),
      );
    return rows.map((row) => otherPlayer(row, userId));
  }).pipe(mapDatabaseError);

export const areFriends = (userId: string, otherId: string) =>
  Effect.map(
    findPair(userId, otherId),
    (row) => row?.status === "accepted",
  ).pipe(mapDatabaseError);

/**
 * Finds the player owning a complete friend code, with the viewer's link to
 * them, in a single query.
 */
export const findPlayerByCode = (userId: string, input: string) =>
  Effect.gen(function* () {
    const code = normalizeFriendCode(input);
    if (!code) return null;
    const db = yield* PgDrizzle;
    const [row] = yield* db
      .select({
        id: user.id,
        name: user.name,
        friendCode: playerProfile.friendCode,
        link: friendship,
      })
      .from(playerProfile)
      .innerJoin(user, eq(user.id, playerProfile.userId))
      .leftJoin(
        friendship,
        or(
          and(
            eq(friendship.requesterId, userId),
            eq(friendship.addresseeId, playerProfile.userId),
          ),
          and(
            eq(friendship.requesterId, playerProfile.userId),
            eq(friendship.addresseeId, userId),
          ),
        ),
      )
      .where(eq(playerProfile.friendCode, code))
      .limit(1);
    if (!row) return null;
    const { link, ...player } = row;
    return {
      ...player,
      relation:
        player.id === userId ? "self" : relationOf(link ?? undefined, userId),
      requestId: link?.status === "pending" ? link.id : null,
    } satisfies PlayerSearchResult;
  }).pipe(mapDatabaseError);

type RequestTarget = { readonly userId: string } | { readonly code: string };

/**
 * Sends a friend request. When the other player had already asked, the
 * friendship is accepted instead. Returns the player the request concerns.
 */
export const sendFriendRequest = (userId: string, target: RequestTarget) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    let targetId: string;
    if ("code" in target) {
      const code = normalizeFriendCode(target.code);
      if (!code)
        return yield* new SocialError({
          message: "Ce code ami est invalide.",
          status: 400,
        });
      const [owner] = yield* db
        .select({ userId: playerProfile.userId })
        .from(playerProfile)
        .where(eq(playerProfile.friendCode, code))
        .limit(1);
      if (!owner)
        return yield* new SocialError({
          message: "Aucun joueur n’a ce code ami.",
          status: 404,
        });
      targetId = owner.userId;
    } else {
      const [found] = yield* db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, target.userId))
        .limit(1);
      if (!found)
        return yield* new SocialError({
          message: "Ce joueur n’existe pas.",
          status: 404,
        });
      targetId = found.id;
    }
    if (targetId === userId)
      return yield* new SocialError({
        message: "Vous ne pouvez pas vous ajouter vous-même.",
        status: 400,
      });

    const existing = yield* findPair(userId, targetId);
    if (existing?.status === "accepted")
      return yield* new SocialError({
        message: "Vous êtes déjà amis.",
        status: 409,
      });
    if (existing?.requesterId === userId)
      return yield* new SocialError({
        message: "Votre demande est déjà envoyée.",
        status: 409,
      });

    const [counts] = yield* db
      .select({
        friends:
          sql<number>`count(*) filter (where ${friendship.status} = 'accepted')`.mapWith(
            Number,
          ),
        outgoing:
          sql<number>`count(*) filter (where ${friendship.status} = 'pending' and ${friendship.requesterId} = ${userId})`.mapWith(
            Number,
          ),
      })
      .from(friendship)
      .where(
        or(
          eq(friendship.requesterId, userId),
          eq(friendship.addresseeId, userId),
        ),
      );
    if ((counts?.friends ?? 0) >= MAX_FRIENDS)
      return yield* new SocialError({
        message: `Vous avez atteint la limite de ${MAX_FRIENDS} amis.`,
        status: 409,
      });

    if (existing) {
      // The other player already asked: both agree, the friendship begins.
      yield* db
        .update(friendship)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(eq(friendship.id, existing.id));
      return { targetId, accepted: true };
    }
    if ((counts?.outgoing ?? 0) >= MAX_OUTGOING_REQUESTS)
      return yield* new SocialError({
        message: "Trop de demandes en attente. Patientez un peu.",
        status: 409,
      });
    const inserted = yield* db
      .insert(friendship)
      .values({
        id: randomUUID(),
        requesterId: userId,
        addresseeId: targetId,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning({ id: friendship.id });
    if (!inserted.length)
      return yield* new SocialError({
        message: "Une demande existe déjà entre vous.",
        status: 409,
      });
    return { targetId, accepted: false };
  }).pipe(mapDatabaseError);

/** Accepts or declines a request received by the player. */
export const respondToFriendRequest = (
  userId: string,
  requestId: string,
  accept: boolean,
) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const condition = and(
      eq(friendship.id, requestId),
      eq(friendship.addresseeId, userId),
      eq(friendship.status, "pending"),
    );
    const rows = accept
      ? yield* db
          .update(friendship)
          .set({ status: "accepted", respondedAt: new Date() })
          .where(condition)
          .returning({ requesterId: friendship.requesterId })
      : yield* db
          .delete(friendship)
          .where(condition)
          .returning({ requesterId: friendship.requesterId });
    const [row] = rows;
    if (!row)
      return yield* new SocialError({
        message: "Cette demande n’existe plus.",
        status: 404,
      });
    return { requesterId: row.requesterId };
  }).pipe(mapDatabaseError);

/** Removes a friend, or cancels a request, between two players. */
export const removeFriendship = (userId: string, otherId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const rows = yield* db
      .delete(friendship)
      .where(pairOf(userId, otherId))
      .returning({ id: friendship.id });
    if (!rows.length)
      return yield* new SocialError({
        message: "Il n’y a plus de lien avec ce joueur.",
        status: 404,
      });
  }).pipe(mapDatabaseError);

/**
 * Public profile of a player, seen by the viewer. What comes back depends on
 * the two dials the player set; the parts they closed are absent from the
 * payload rather than blanked, so nothing leaks over the wire.
 */
export const playerProfileFor = (viewerId: string, playerId: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle;
    const [found] = yield* db
      .select({ id: user.id, name: user.name, createdAt: user.createdAt })
      .from(user)
      .where(eq(user.id, playerId))
      .limit(1);
    if (!found)
      return yield* new SocialError({
        message: "Ce joueur n’existe pas.",
        status: 404,
      });
    const self = viewerId === playerId;
    const [row, link, friendCounts, stats] = yield* Effect.all(
      [
        ensureProfileRow(playerId),
        self ? Effect.succeed(undefined) : findPair(viewerId, playerId),
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(friendship)
          .where(
            and(
              eq(friendship.status, "accepted"),
              or(
                eq(friendship.requesterId, playerId),
                eq(friendship.addresseeId, playerId),
              ),
            ),
          ),
        statsFor(playerId),
      ],
      { concurrency: "unbounded" },
    );
    const relation = self ? ("self" as const) : relationOf(link, viewerId);
    const openProfile = allows(row.visibility.profile, relation);
    const openEarnings =
      openProfile && allows(row.visibility.earnings, relation);

    return {
      id: found.id,
      name: found.name,
      friendCode: row.friendCode,
      memberSince: found.createdAt.toISOString(),
      relation,
      requestId: link && link.status === "pending" ? link.id : null,
      friends: friendCounts[0]?.count ?? 0,
      stats: openProfile ? withoutHiddenEarnings(stats, openEarnings) : null,
      guild: null,
      visibility: self ? row.visibility : null,
    } satisfies Omit<PlayerProfile, "online">;
  }).pipe(mapDatabaseError);

/** Drops the money from a set of stats when the viewer may not read it. */
function withoutHiddenEarnings(stats: PlayerStats, open: boolean): PlayerStats {
  if (open) return stats;
  return {
    summary: { ...stats.summary, earnings: null },
    games: stats.games.map((game) => ({ ...game, earnings: null })),
  };
}

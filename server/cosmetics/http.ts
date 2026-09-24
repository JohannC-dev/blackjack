import type { IncomingMessage, ServerResponse } from "node:http";
import type { PgDrizzle } from "@effect/sql-drizzle/Pg";
import type { SqlClient } from "@effect/sql/SqlClient";
import { fromNodeHeaders } from "better-auth/node";
import { Effect, Either, Schema } from "effect";
import {
  isCosmeticKind,
  type Collection,
  type EquippedLookup,
  type EquippedSkins,
} from "../../src/lib/cosmetics";
import { auth } from "../auth";
import { runDatabase } from "../db/client";
import { HttpError, assertSameOrigin, readJson, send } from "../http";
import {
  CosmeticError,
  collectionFor,
  cosmeticAssetOf,
  equipCosmetic,
  equippedFor,
} from "./repository";

/** Enough for every seat of a table and a friend list page. */
const MAX_LOOKUP = 50;

const EquipBody = Schema.Struct({
  cosmeticId: Schema.NullOr(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  ),
});

/** Runs a database effect; refusals become HTTP errors. */
async function run<A, E>(effect: Effect.Effect<A, E, PgDrizzle | SqlClient>) {
  const result = await runDatabase(Effect.either(effect));
  if (Either.isRight(result)) return result.right;
  const error = result.left;
  if (error instanceof CosmeticError)
    throw new HttpError(error.status, error.message);
  throw error;
}

/**
 * Serves /api/cosmetics: the collection and the equipment of the signed-in
 * player, what other players wear, and the pictures themselves.
 */
export async function handleCosmeticRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://club");
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== "/api/cosmetics" && !path.startsWith("/api/cosmetics/"))
    return false;
  const method = req.method ?? "GET";

  try {
    let parts: string[];
    try {
      parts = path.split("/").slice(3).map(decodeURIComponent);
    } catch {
      throw new HttpError(400, "Adresse invalide.");
    }

    // GET /api/cosmetics/:id/asset?v=<hash>, public like any other image.
    if (method === "GET" && parts.length === 2 && parts[1] === "asset") {
      const asset = await run(cosmeticAssetOf(parts[0]!));
      if (!asset) throw new HttpError(404, "Visuel introuvable.");
      res.writeHead(200, {
        "Content-Type": asset.contentType,
        "Content-Length": asset.data.length,
        // The hash is in the URL: a stale one must not be kept for long.
        "Cache-Control":
          url.searchParams.get("v") === asset.hash
            ? "public, max-age=31536000, immutable"
            : "public, max-age=60",
        ETag: `"${asset.hash}"`,
        // An SVG may carry script: never let it run, even opened directly.
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(asset.data);
      return true;
    }

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) throw new HttpError(401, "Non authentifié.");
    const me = session.user.id;
    if (method !== "GET") assertSameOrigin(req);

    // GET /api/cosmetics
    if (method === "GET" && parts.length === 0) {
      send(res, 200, (await run(collectionFor(me))) satisfies Collection);
      return true;
    }

    // GET /api/cosmetics/equipped?users=a,b
    if (method === "GET" && parts.length === 1 && parts[0] === "equipped") {
      const users = [
        ...new Set(
          (url.searchParams.get("users") ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id && id.length <= 64),
        ),
      ];
      if (users.length > MAX_LOOKUP)
        throw new HttpError(400, "Trop de joueurs demandés.");
      send(res, 200, (await run(equippedFor(users))) satisfies EquippedLookup);
      return true;
    }

    // PUT /api/cosmetics/equipped/:kind { cosmeticId: string | null }
    if (method === "PUT" && parts.length === 2 && parts[0] === "equipped") {
      const kind = parts[1];
      if (!isCosmeticKind(kind))
        throw new HttpError(404, "Emplacement inconnu.");
      const body = Schema.decodeUnknownEither(EquipBody)(await readJson(req));
      if (Either.isLeft(body)) throw new HttpError(400, "Choix invalide.");
      const equipped = await run(
        equipCosmetic(me, kind, body.right.cosmeticId),
      );
      send(res, 200, equipped satisfies EquippedSkins);
      return true;
    }

    throw new HttpError(404, "Route introuvable.");
  } catch (error) {
    if (error instanceof HttpError)
      send(res, error.status, { error: error.message });
    else {
      console.error("Skins ·", error);
      send(res, 503, { error: "Les skins sont temporairement indisponibles." });
    }
    return true;
  }
}

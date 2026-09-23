import type { IncomingMessage, ServerResponse } from "node:http";
import type { PgDrizzle } from "@effect/sql-drizzle/Pg";
import type { SqlClient } from "@effect/sql/SqlClient";
import { fromNodeHeaders } from "better-auth/node";
import { Effect, Either } from "effect";
import type { ReferralOverview } from "../../src/lib/referral";
import { auth } from "../auth";
import { runDatabase } from "../db/client";
import { HttpError, send } from "../http";
import {
  ReferralError,
  referralOverview,
  type ReferralDeps,
} from "./repository";

/**
 * Serves /api/referrals, the parrainage panel of the signed-in player. A code
 * is only ever claimed during a sign-up, so there is nothing to POST here.
 */
export async function handleReferralRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ReferralDeps,
): Promise<boolean> {
  const path = (req.url ?? "/").split("?")[0]!.replace(/\/+$/, "");
  if (path !== "/api/referrals") return false;

  try {
    if ((req.method ?? "GET") !== "GET")
      throw new HttpError(405, "Méthode non autorisée.");
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) throw new HttpError(401, "Non authentifié.");
    send(res, 200, await run(referralOverview(session.user.id, deps)));
  } catch (error) {
    if (error instanceof HttpError)
      send(res, error.status, { error: error.message });
    else {
      console.error("Parrainage ·", error);
      send(res, 503, {
        error: "Le parrainage est temporairement indisponible.",
      });
    }
  }
  return true;
}

/** Runs a database effect; refusals become HTTP errors. */
async function run(
  effect: Effect.Effect<ReferralOverview, unknown, PgDrizzle | SqlClient>,
) {
  const result = await runDatabase(Effect.either(effect));
  if (Either.isRight(result)) return result.right;
  if (result.left instanceof ReferralError)
    throw new HttpError(result.left.status, result.left.message);
  throw result.left;
}

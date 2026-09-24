import type { IncomingMessage, ServerResponse } from "node:http";
import type { PgDrizzle } from "@effect/sql-drizzle/Pg";
import type { SqlClient } from "@effect/sql/SqlClient";
import { fromNodeHeaders } from "better-auth/node";
import { Effect, Either } from "effect";
import { auth } from "../auth";
import { runDatabase } from "../db/client";
import { HttpError, send } from "../http";
import {
  ReferralError,
  claimReferralRewards,
  referralOverview,
  type ReferralDeps,
} from "./repository";

/**
 * Serves /api/referrals, the parrainage panel of the signed-in player, and
 * /api/referrals/claim, where they collect the credits their filleuls have
 * unlocked. A parrainage code itself is only ever used during a sign-up.
 */
export async function handleReferralRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ReferralDeps,
): Promise<boolean> {
  const path = (req.url ?? "/").split("?")[0]!.replace(/\/+$/, "");
  const claiming = path === "/api/referrals/claim";
  if (path !== "/api/referrals" && !claiming) return false;

  try {
    const method = req.method ?? "GET";
    if (claiming ? method !== "POST" : method !== "GET")
      throw new HttpError(405, "Méthode non autorisée.");
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) throw new HttpError(401, "Non authentifié.");
    if (claiming) {
      const claim = await run(claimReferralRewards(session.user.id));
      send(res, 200, {
        ...claim,
        overview: await run(referralOverview(session.user.id, deps)),
      });
      return true;
    }
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
async function run<A>(
  effect: Effect.Effect<A, unknown, PgDrizzle | SqlClient>,
) {
  const result = await runDatabase(Effect.either(effect));
  if (Either.isRight(result)) return result.right;
  if (result.left instanceof ReferralError)
    throw new HttpError(result.left.status, result.left.message);
  throw result.left;
}

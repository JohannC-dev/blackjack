import { APIError, createAuthMiddleware } from "better-auth/api";
import { Effect, Either } from "effect";
import { REFERRAL_CODE_FIELD } from "../../src/lib/referral";
import { normalizeFriendCode } from "../../src/lib/social";
import { runDatabase } from "../db/client";
import { announceReferral } from "./events";
import {
  ReferralError,
  findParrainByCode,
  registerReferral,
} from "./repository";

const SIGN_UP_PATH = "/sign-up/email";

/** The optional parrainage code sent along with a sign-up, if there is one. */
function codeOf(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const raw = (body as Record<string, unknown>)[REFERRAL_CODE_FIELD];
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw;
}

/**
 * Refuses a sign-up carrying an unusable parrainage code, before the account
 * exists. The player fixes the code instead of losing the bonus for good.
 */
export const checkReferralCode = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== SIGN_UP_PATH) return;
  const code = codeOf(ctx.body);
  if (!code) return;
  if (!normalizeFriendCode(code))
    throw new APIError("BAD_REQUEST", {
      message: "Ce code de parrainage est invalide.",
      code: "INVALID_REFERRAL_CODE",
    });
  const parrain = await runDatabase(
    Effect.either(findParrainByCode(code)),
  ).catch(() => null);
  // A database outage must not block the sign-up: the claim below will refuse.
  if (!parrain || Either.isLeft(parrain)) return;
  if (!parrain.right)
    throw new APIError("BAD_REQUEST", {
      message: "Aucun joueur n’a ce code de parrainage.",
      code: "UNKNOWN_REFERRAL_CODE",
    });
});

/**
 * Binds the fresh account to its parrain. It runs after the sign-up endpoint
 * returned, so the user row is committed and the parrainage can reference it.
 */
export const claimReferralCode = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== SIGN_UP_PATH) return;
  const code = codeOf(ctx.body);
  if (!code) return;
  const returned = ctx.context.returned as
    | { user?: { id?: unknown; name?: unknown } }
    | undefined;
  const filleulId = returned?.user?.id;
  if (typeof filleulId !== "string") return;

  try {
    const result = await runDatabase(
      Effect.either(registerReferral(filleulId, code)),
    );
    if (Either.isLeft(result)) {
      // The account exists either way; only the bonus is lost.
      if (!(result.left instanceof ReferralError))
        console.error("Parrainage · inscription", result.left);
      return;
    }
    announceReferral({
      parrainId: result.right.parrain.id,
      filleul: {
        id: filleulId,
        name:
          typeof returned?.user?.name === "string" ? returned.user.name : "",
      },
    });
  } catch (error) {
    console.error("Parrainage · inscription", error);
  }
});

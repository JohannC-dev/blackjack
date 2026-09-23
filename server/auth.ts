import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { captcha } from "better-auth/plugins";
import { authDatabase } from "./db/client";
import { authSchema } from "./db/schema";
import { checkReferralCode, claimReferralCode } from "./referral/sign-up";

const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY?.trim();

export const auth = betterAuth({
  database: drizzleAdapter(authDatabase, {
    provider: "pg",
    schema: authSchema,
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    deferSessionRefresh: true,
  },
  plugins: turnstileSecretKey
    ? [
        captcha({
          provider: "cloudflare-turnstile",
          secretKey: turnstileSecretKey,
          endpoints: ["/sign-in/email"],
          expectedAction: "login",
        }),
      ]
    : [],
  // A parrainage code only travels with a sign-up: checked before the account
  // is created, applied once the account is committed.
  hooks: {
    before: checkReferralCode,
    after: claimReferralCode,
  },
  advanced: {
    database: {
      joins: false,
    },
  },
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
});

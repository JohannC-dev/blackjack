import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { authDatabase } from "./db/client";
import { authSchema } from "./db/schema";
import { checkReferralCode, claimReferralCode } from "./referral/sign-up";

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

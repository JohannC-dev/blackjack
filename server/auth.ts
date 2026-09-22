import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { authDatabase } from "./db/client";
import { authSchema } from "./db/schema";

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

import { defineConfig } from "drizzle-kit";
import { databaseConnectionUrl } from "./server/db/url";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dbCredentials: {
    url: databaseConnectionUrl(),
  },
  strict: true,
  verbose: true,
});

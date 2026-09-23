import journal from "../../server/db/migrations/meta/_journal.json";

/** Both values are embedded in the browser bundle at build time. */
export const bundledVersion = {
  code: process.env.NEXT_PUBLIC_SOURCE_COMMIT || "development",
  database: journal.entries.at(-1)?.tag ?? "initial",
};

export type DeploymentVersion = typeof bundledVersion;

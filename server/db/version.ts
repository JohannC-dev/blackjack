import { pool } from "./client";
import {
  bundledVersion,
  type DeploymentVersion,
} from "../../src/lib/deployment-version";

const CACHE_MS = 5_000;
let cached: { value: DeploymentVersion; until: number } | undefined;
let pending: Promise<DeploymentVersion> | undefined;
let unavailableUntil = 0;

export async function currentDeploymentVersion(): Promise<DeploymentVersion> {
  if (cached && Date.now() < cached.until) return cached.value;
  if (Date.now() < unavailableUntil)
    throw new Error("Deployment version is temporarily unavailable.");
  pending ??= pool
    .query<{ code_revision: string; database_revision: string }>(
      "SELECT code_revision, database_revision FROM deployment_version WHERE id = 1",
    )
    .then(({ rows }) => {
      const row = rows[0];
      if (!row) throw new Error("Deployment version has not been published.");
      const value = {
        code: row.code_revision,
        database: row.database_revision,
      };
      cached = { value, until: Date.now() + CACHE_MS };
      unavailableUntil = 0;
      return value;
    })
    .catch((error) => {
      unavailableUntil = Date.now() + CACHE_MS;
      throw error;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

export async function publishDeploymentVersion() {
  await pool.query(
    `INSERT INTO deployment_version (id, code_revision, database_revision)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET
       code_revision = EXCLUDED.code_revision,
       database_revision = EXCLUDED.database_revision`,
    [bundledVersion.code, bundledVersion.database],
  );
  cached = undefined;
  unavailableUntil = 0;
}

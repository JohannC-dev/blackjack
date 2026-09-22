import * as PgDrizzle from "@effect/sql-drizzle/Pg";
import * as EffectPg from "@effect/sql-pg/PgClient";
import { SqlClient } from "@effect/sql/SqlClient";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect, Layer, ManagedRuntime } from "effect";
import { Pool } from "pg";
import { schema } from "./schema";
import { databaseConnectionUrl, databaseSsl } from "./url";

const databaseUrl = databaseConnectionUrl();

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl(),
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  application_name: "minuit",
});

export const authDatabase = drizzle({
  client: pool,
  schema,
});

const SqlLive = EffectPg.layerFromPool({
  acquire: Effect.succeed(pool),
  applicationName: "minuit-effect",
});

const EffectDrizzleLive = Layer.provide(
  Layer.effect(PgDrizzle.PgDrizzle, PgDrizzle.make({ schema } as never)),
  SqlLive,
);

export const databaseRuntime = ManagedRuntime.make(
  Layer.merge(SqlLive, EffectDrizzleLive),
);

export function runDatabase<A, E>(
  effect: Effect.Effect<A, E, PgDrizzle.PgDrizzle | SqlClient>,
) {
  return databaseRuntime.runPromise(effect);
}

export async function closeDatabase() {
  await databaseRuntime.dispose();
  await pool.end();
}

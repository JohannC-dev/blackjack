import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { databaseConnectionUrl, databaseSsl } from "./url";

const client = new Client({
  connectionString: databaseConnectionUrl(),
  ssl: databaseSsl(),
  application_name: "minuit-migrations",
});

await client.connect();
let locked = false;
try {
  // Only one container may inspect and apply the migration journal at a time.
  await client.query("SELECT pg_advisory_lock(584145, 1)");
  locked = true;
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
  });
  console.log("Database migrations are up to date.");
} finally {
  if (locked) await client.query("SELECT pg_advisory_unlock(584145, 1)");
  await client.end();
}

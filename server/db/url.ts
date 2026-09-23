export function databaseConnectionUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL est requis.");

  if (process.env.DATABASE_SSL !== "disable") return raw;

  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

export function databaseSsl() {
  return process.env.DATABASE_SSL === "disable" ? false : undefined;
}

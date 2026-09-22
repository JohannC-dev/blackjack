import { randomUUID } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import pg from "pg";
import { databaseConnectionUrl, databaseSsl } from "../server/db/url";

export type TestSession = {
  readonly cookie: string;
  readonly email: string;
  readonly userId: string;
};

export async function createTestSession(
  baseUrl: string,
  name: string,
  balance = 2_000,
) {
  const email = `test-${randomUUID()}@example.test`;
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({
      name,
      email,
      password: "Test-password-2026",
    }),
  });
  if (!response.ok)
    throw new Error(`Inscription de test refusée: ${await response.text()}`);
  const payload = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  if (!cookie) throw new Error("Cookie de session de test absent.");
  if (balance !== 2_000) {
    const client = new pg.Client({
      connectionString: databaseConnectionUrl(),
      ssl: databaseSsl(),
    });
    try {
      await client.connect();
      await client.query(
        `insert into wallet_account (user_id, balance_minor)
         values ($1, $2)
         on conflict (user_id) do update
         set balance_minor = excluded.balance_minor, version = wallet_account.version + 1, updated_at = now()`,
        [payload.user.id, Math.round(balance * 100)],
      );
    } finally {
      await client.end();
    }
  }
  return { cookie, email, userId: payload.user.id } satisfies TestSession;
}

export function socketAuth(session: TestSession, baseUrl: string) {
  return {
    transports: ["websocket" as const],
    reconnection: false,
    extraHeaders: { cookie: session.cookie, origin: baseUrl },
  };
}

export async function authenticateContext(
  context: BrowserContext,
  baseUrl: string,
  name: string,
  balance = 2_000,
) {
  const session = await createTestSession(baseUrl, name, balance);
  await context.addCookies(
    session.cookie.split("; ").map((pair) => {
      const separator = pair.indexOf("=");
      return {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        url: baseUrl,
      };
    }),
  );
  return session;
}

import type { IncomingMessage, ServerResponse } from "node:http";

/** A refusal already worded for the player, with the status to answer with. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

/** Club mutations only come from the club page itself. */
export function assertSameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    if (new URL(origin).host === req.headers.host) return;
  } catch {
    // Falls through to the refusal.
  }
  throw new HttpError(403, "Origine refusée.");
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new HttpError(415, "Format de requête invalide.");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 4096) throw new HttpError(413, "Requête trop volumineuse.");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Requête invalide.");
  }
}

import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";
import type { Ack, PokerClientState } from "../src/lib/types";

const baseUrl = process.env.TEST_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const bot = io(baseUrl, { transports: ["websocket"], autoConnect: false });

async function until(check: () => boolean, message: string, timeout = 10_000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error(message);
    await Bun.sleep(50);
  }
}

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) =>
    console.error(`[browser:error] ${error.message}`),
  );
  await page.addInitScript(
    (profile) =>
      localStorage.setItem("minuit.profile.v1", JSON.stringify(profile)),
    { token: randomUUID(), name: "Victoria", balance: 100_000 },
  );
  await page.goto(baseUrl);
  await page.locator(".game-selection").waitFor();
  await page.screenshot({ path: "/tmp/minuit-club.png", fullPage: true });
  await page.getByTitle("Poker").click();
  await page.locator(".poker-lobby").waitFor();
  await page.screenshot({
    path: "/tmp/minuit-poker-lobby.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Trouver une table/ }).click();
  await page.locator(".poker-felt").waitFor();

  let botState: PokerClientState | undefined;
  bot.on("poker:state", (state: PokerClientState) => (botState = state));
  bot.connect();
  await until(() => bot.connected, "Le bot UI ne se connecte pas");
  const join: Ack = await bot.timeout(5_000).emitWithAck("join", {
    tableId: "UITEST",
    profile: { token: randomUUID(), name: "Oscar", balance: 100_000 },
  });
  if (!join.ok) throw new Error(join.error);
  const match: Ack = await bot.timeout(5_000).emitWithAck("poker:command", {
    type: "match",
    mode: "cash",
    stake: 20,
    buyIn: 2_000,
  });
  if (!match.ok) throw new Error(match.error);
  await until(
    () => botState?.table?.phase === "preflop",
    "La table cash ne démarre pas",
  );
  await page
    .locator(".poker-actions.enabled")
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await page.screenshot({
    path: "/tmp/minuit-poker-table.png",
    fullPage: true,
  });

  const result = await page.evaluate(() => ({
    heading: document.querySelector(".poker-table-heading h1")?.textContent,
    seats: document.querySelectorAll(".poker-seat.occupied").length,
    communitySlots: document.querySelectorAll(
      ".community-cards > .community-placeholder",
    ).length,
    chatClosedByDefault: !document.querySelector(".poker-chat"),
    primaryActions: document.querySelectorAll(".poker-actions > button").length,
    raiseClosedByDefault: !document.querySelector(".raise-drawer"),
    handSummary: document.querySelector(".poker-hand-summary")?.textContent,
    seatTimer: document
      .querySelector(".poker-seat.acting .poker-player-card")
      ?.getAttribute("data-turn-seconds"),
    duplicateStatusTimer: !!document.querySelector(".poker-status > strong"),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  if (result.seats !== 2)
    throw new Error(`Deux sièges attendus, reçu ${result.seats}`);
  if (result.communitySlots !== 5)
    throw new Error("Le board doit afficher cinq emplacements");
  if (!result.chatClosedByDefault)
    throw new Error("Le chat doit être fermé par défaut");
  if (result.primaryActions !== 3)
    throw new Error(`Trois actions attendues, reçu ${result.primaryActions}`);
  if (!result.raiseClosedByDefault)
    throw new Error("Le réglage de relance doit être fermé par défaut");
  if (!result.handSummary?.includes("VOTRE TAPIS"))
    throw new Error("Le tapis du joueur doit être clairement visible");
  if (!result.seatTimer?.endsWith("s"))
    throw new Error("Le temps de parole doit apparaître sur le siège actif");
  if (result.duplicateStatusTimer)
    throw new Error(
      "Le temps de parole ne doit plus être dupliqué sous la table",
    );
  await page.getByRole("button", { name: "Ouvrir la discussion" }).click();
  await page.getByRole("dialog", { name: "Discussion" }).waitFor();
  if (result.overflow)
    throw new Error("La table Poker déborde horizontalement sur desktop");
  console.log(JSON.stringify(result));
} finally {
  bot.disconnect();
  await browser.close();
}

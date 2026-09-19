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
  await page
    .getByRole("button", { name: "Cash Game, choisir le plafond" })
    .click();
  await page.getByRole("button", { name: /^Velours, plafond/ }).click();
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
    .locator(".poker-action-zone.enabled")
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
    turnOutline: (() => {
      const outline = document.querySelector<SVGRectElement>(
        ".poker-seat.acting .poker-turn-progress",
      );
      return outline
        ? {
            pathLength: outline.getAttribute("pathLength"),
            timing: getComputedStyle(outline).transitionTimingFunction,
            offset: Number.parseFloat(
              getComputedStyle(outline).strokeDashoffset,
            ),
          }
        : null;
    })(),
    redundantStatusCard: !!document.querySelector(".poker-status"),
    redundantBlindActions: Array.from(
      document.querySelectorAll(".last-action"),
    ).filter((element) => /^(Small|Big) blind$/.test(element.textContent ?? ""))
      .length,
    chipStacks: document.querySelectorAll(".poker-chip-stack").length,
    chipDiscs: document.querySelectorAll(".poker-chip-disc").length,
    chipStages: Array.from(
      document.querySelectorAll<HTMLElement>(".poker-chip-stack"),
    ).map((stack) => stack.dataset.chipStage),
    stackTransition: getComputedStyle(
      document.querySelector(".poker-chip-stack")!,
    ).animationName,
    columnTransition: getComputedStyle(
      document.querySelector(".poker-chip-column")!,
    ).animationName,
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
  if (!result.handSummary?.includes("YOUR STACK"))
    throw new Error("Le stack du joueur doit être clairement visible");
  if (!result.seatTimer?.endsWith("s"))
    throw new Error("Le temps de parole doit apparaître sur le siège actif");
  const displayedSeconds = Number.parseInt(result.seatTimer);
  const minimumOffset = 100 * (1 - displayedSeconds / 25);
  const maximumOffset = 100 * (1 - (displayedSeconds - 1) / 25);
  if (
    result.turnOutline?.pathLength !== "100" ||
    result.turnOutline.timing !== "linear" ||
    result.turnOutline.offset < minimumOffset - 1 ||
    result.turnOutline.offset > maximumOffset + 1
  )
    throw new Error(
      "Le contour du temps de parole doit progresser uniformément",
    );
  if (result.redundantStatusCard)
    throw new Error("La carte de statut redondante doit être supprimée");
  if (result.redundantBlindActions)
    throw new Error("Les pastilles SB/BB ne doivent pas être dupliquées");
  if (result.chipStacks < 3)
    throw new Error(
      `Le pot et les deux blinds doivent afficher des jetons, reçu ${result.chipStacks}`,
    );
  if (result.chipDiscs <= result.chipStacks)
    throw new Error("Chaque mise doit être représentée par une pile de jetons");
  if (result.chipStages.some((stage) => stage !== "1"))
    throw new Error("Les petites blinds doivent utiliser le premier stade");
  if (
    result.stackTransition !== "chip-stack-stage-settle" ||
    result.columnTransition !== "chip-stack-column-rise"
  )
    throw new Error("Les changements de stade doivent être animés");
  await page.getByRole("button", { name: "Ouvrir la discussion" }).click();
  const chatDialog = page.getByRole("dialog", { name: "Table chat" });
  await chatDialog.waitFor();
  const chatBox = await chatDialog.boundingBox();
  if (!chatBox || chatBox.width > 430 || chatBox.x < 900)
    throw new Error("Le chat desktop doit s’ouvrir comme un popup compact");
  await page.screenshot({
    path: "/tmp/minuit-poker-chat.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fermer la discussion" }).click();
  if (result.overflow)
    throw new Error("La table Poker déborde horizontalement sur desktop");

  let guard = 0;
  while (botState?.table?.phase !== "showdown" && guard++ < 30) {
    const table = botState?.table;
    if (!table?.activePlayerId) {
      await Bun.sleep(250);
      continue;
    }
    const active = table.seats.find(
      (seat) => seat.id === table.activePlayerId,
    )!;
    const action = table.currentBet > active.bet ? "call" : "check";
    if (active.name === "Oscar") {
      const ack: Ack = await bot
        .timeout(5_000)
        .emitWithAck("poker:command", { type: "action", action });
      if (!ack.ok) throw new Error(ack.error);
    } else {
      await page
        .getByRole("button", { name: new RegExp(`^${action}`, "i") })
        .click({ timeout: 5_000 });
    }
    await Bun.sleep(120);
  }
  await page.locator(".hand-result-banner").waitFor({ timeout: 5_000 });
  const showdown = await page.evaluate(() => ({
    winningCards: document.querySelectorAll(".playing-card.winning-card")
      .length,
    winners: document.querySelectorAll(".poker-seat.winner").length,
    centralPotChips: document.querySelectorAll(".pot-display .poker-chip-stack")
      .length,
  }));
  if (showdown.winningCards < 1 || showdown.winningCards > 5)
    throw new Error(
      `Seules les cartes utiles à la combinaison doivent être mises en évidence, reçu ${showdown.winningCards}`,
    );
  if (showdown.winners < 1)
    throw new Error("Le siège gagnant doit être mis en évidence");
  if (showdown.centralPotChips !== 1)
    throw new Error("Les jetons du pot doivent rester visibles au showdown");
  await page.screenshot({
    path: "/tmp/minuit-poker-showdown.png",
    fullPage: true,
  });
  const winner = botState!.table!.history[0].winners[0];
  if (winner.name === "Victoria") {
    await page.getByRole("button", { name: "Muck hand" }).click();
  } else {
    const muck: Ack = await bot
      .timeout(5_000)
      .emitWithAck("poker:command", { type: "muck" });
    if (!muck.ok) throw new Error(muck.error);
  }
  await page
    .locator(".poker-seat.winner .playing-card.card-back")
    .first()
    .waitFor();
  const muckedCards = await page
    .locator(".poker-seat.winner .playing-card.card-back")
    .count();
  if (muckedCards !== 2)
    throw new Error(
      `La main gagnante muckée doit afficher deux dos, reçu ${muckedCards}`,
    );
  await page.screenshot({
    path: "/tmp/minuit-poker-mucked.png",
    fullPage: true,
  });
  console.log(JSON.stringify(result));
} finally {
  bot.disconnect();
  await browser.close();
}

import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const browser = await chromium.launch({ headless: true });
const baseUrl = process.env.TEST_URL ?? "http://localhost:3000";

async function pageWithBalance(balance: number) {
  const page = await browser.newPage();
  await page.addInitScript(
    (profile) =>
      localStorage.setItem("minuit.profile.v1", JSON.stringify(profile)),
    { token: randomUUID(), name: "Recave test", balance },
  );
  await page.goto(baseUrl);
  return page;
}

try {
  const empty = await pageWithBalance(0);
  await empty.getByTitle("Blackjack", { exact: true }).click();
  const dialog = empty.getByRole("dialog", { name: "Recaver" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Recaver à 10 000 cr." }).click();
  await expect(dialog).toBeHidden();
  await expect(empty.locator(".topbar .wallet b")).toHaveText("10 000");

  const underThreshold = await pageWithBalance(4_999);
  await underThreshold.getByTitle("Poker", { exact: true }).click();
  await underThreshold
    .getByRole("button", { name: /Spin & Play, 5 000 crédits/ })
    .click();
  await expect(
    underThreshold.getByRole("dialog", { name: "Recaver" }),
  ).toBeVisible();

  const atThreshold = await pageWithBalance(5_000);
  await atThreshold.getByTitle("Poker", { exact: true }).click();
  await expect(
    atThreshold.getByRole("dialog", { name: "Recaver" }),
  ).toHaveCount(0);
  console.log(
    "PASS: modale globale, solde remplacé et seuil de recave respecté dans l'interface.",
  );
} finally {
  await browser.close();
}

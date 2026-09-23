import { chromium, expect, type Page } from "@playwright/test";
import { authenticateContext } from "./auth-session";

const baseUrl = process.env.TEST_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];

async function lobby(balance: number) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await authenticateContext(context, baseUrl, "Lobby test", balance);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl);
  await page.getByTitle("Poker", { exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Connecté au club");
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function checkLayout(page: Page) {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow)
      console.log(
        await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          offenders: [...document.querySelectorAll("body *")]
            .map((el) => ({
              tag: el.tagName,
              cls: el.getAttribute("class"),
              right: el.getBoundingClientRect().right,
              minWidth: getComputedStyle(el).minWidth,
            }))
            .filter((el) => el.right > innerWidth + 1)
            .slice(0, 12),
        })),
      );
    expect(overflow, `Le lobby déborde à ${width}px`).toBe(false);
    await expect(
      page.getByRole("button", { name: "Cash Game, choisir le plafond" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Spin & Play,/ }),
    ).toHaveCount(5);
    await expect(page.getByRole("tab")).toHaveCount(0);
    if (width === 1440 || width === 390) {
      await page.screenshot({
        path: `/tmp/minuit-lobby-${width}.png`,
        fullPage: true,
      });
    }
  }
}

try {
  const page = await lobby(1_262);
  const cash = page.getByRole("button", {
    name: "Cash Game, choisir le plafond",
  });
  await expect(
    page.getByRole("button", { name: /^Spin & Play, 200 crédits$/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /^Spin & Play, 5\s000/ }),
  ).toBeDisabled();
  await checkLayout(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await cash.click();
  const dialog = page.getByRole("dialog", {
    name: "Choisissez votre plafond.",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /^Salon, plafond/ }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: /^Velours, plafond/ }),
  ).toHaveAccessibleName(/entrer avec 1\s262 crédits/);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `La modale déborde à ${width}px`,
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(cash).toBeFocused();
  await cash.click();
  await dialog.getByText("Personnaliser mon buy-in").click();
  await dialog.getByRole("slider").fill("40");
  await expect(
    dialog.getByRole("button", { name: /^Velours, plafond/ }),
  ).toHaveAccessibleName(/entrer avec 800 crédits/);
  await dialog.getByRole("button", { name: /^Velours, plafond/ }).click();
  await expect(page.locator(".poker-felt")).toBeVisible();
  await expect(page.locator(".wallet b")).toHaveText("462");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTitle("Blackjack", { exact: true }).click();
  const leaveConfirmation = page.getByRole("dialog", {
    name: "Quitter la partie de poker ?",
  });
  await expect(leaveConfirmation).toBeVisible();
  await leaveConfirmation
    .getByRole("button", { name: "Rester au poker" })
    .click();
  await expect(page.locator(".poker-felt")).toBeVisible();
  await expect(page.locator(".wallet b")).toHaveText("462");
  await page.getByTitle("Blackjack", { exact: true }).click();
  await leaveConfirmation
    .getByRole("button", { name: "Quitter et jouer au Blackjack" })
    .click();
  await expect(page.locator(".table-panel")).toBeVisible();
  await expect(page.locator(".wallet b")).toHaveText("1 262");
  await page.context().close();

  const funded = await lobby(50_000);
  await funded
    .getByRole("button", { name: "Cash Game, choisir le plafond" })
    .click();
  await expect(
    funded.getByRole("button", { name: /^Salon, plafond/ }),
  ).toBeEnabled();
  await expect(
    funded.getByRole("button", { name: /^Minuit, plafond/ }),
  ).toBeEnabled();
  await funded
    .getByRole("button", { name: "Fermer le choix du plafond" })
    .click();
  await funded
    .getByRole("button", { name: "Spin & Play, 500 crédits", exact: true })
    .click();
  await expect(funded.locator(".queue-screen")).toBeVisible();
  await expect(funded.locator(".wallet b")).toHaveText("49 500");
  await funded.getByRole("button", { name: /Annuler et récupérer/ }).click();
  await expect(funded.locator(".wallet b")).toHaveText("50 000");
  await funded.context().close();

  const insufficient = await lobby(150);
  const spins = insufficient.getByRole("button", { name: /^Spin & Play,/ });
  for (let i = 0; i < 5; i++) await expect(spins.nth(i)).toBeDisabled();
  await insufficient
    .getByRole("button", { name: "Cash Game, choisir le plafond" })
    .click();
  await expect(
    insufficient.getByRole("button", { name: /^Velours, plafond/ }),
  ).toBeDisabled();
  await expect(
    insufficient.getByRole("button", { name: /^Velours, plafond/ }),
  ).toHaveAccessibleName(/650 crédits manquants/);
  await insufficient.context().close();
  expect(errors).toEqual([]);
  console.log(
    "PASS: six cartes sans onglets, accès direct Cash/Spin, plafonds et tapis adaptés au solde, mobile 320–1440 px, focus des modales et restitution du stack avant Blackjack.",
  );
} finally {
  await browser.close();
}

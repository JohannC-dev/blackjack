import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { authenticateContext } from "./auth-session";

const baseUrl = process.env.TEST_URL ?? "http://localhost:3000";
const table = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await authenticateContext(context, baseUrl, "Test visuel");
  const page = await context.newPage();
  page.on("console", (message) =>
    console.log(`[browser:${message.type()}] ${message.text()}`),
  );
  page.on("pageerror", (error) =>
    console.log(`[browser:error] ${error.message}`),
  );
  page.on("requestfailed", (request) =>
    console.log(
      `[request:failed] ${request.url()} ${request.failure()?.errorText}`,
    ),
  );
  await page.goto(`${baseUrl}/?table=${table}`);
  await page.getByTitle("Blackjack").click();
  try {
    await page.locator(".my-seat").waitFor({ timeout: 10_000 });
  } catch (error) {
    await page.screenshot({ path: "/tmp/minuit-ui-error.png", fullPage: true });
    console.log((await page.locator("body").innerText()).slice(-2_000));
    throw error;
  }

  const layout = await page.evaluate(() => {
    const panel = document.querySelector(".table-panel")!;
    const controls = document.querySelector(".controls-panel")!;
    const status = document.querySelector(".table-status")!;
    const main = document.querySelector(".my-seat .spot-main")!;
    const three = document.querySelector(".my-seat .spot-three")!;
    const pairs = document.querySelector(".my-seat .spot-pairs")!;
    const rect = (element: Element) => element.getBoundingClientRect();
    return {
      controlsInsideTable: panel.contains(controls),
      controlsFollowStatus:
        Math.abs(rect(controls).top - rect(status).bottom) < 2,
      sideBetsAboveMain:
        rect(three).top < rect(main).top && rect(pairs).top < rect(main).top,
      noRulesSidebar: !document.querySelector(".right-sidebar"),
      panelWidth: rect(panel).width,
      viewportWidth: window.innerWidth,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  if (!layout.controlsInsideTable)
    throw new Error("Controls are outside the table card");
  if (!layout.controlsFollowStatus)
    throw new Error("Controls are detached from table status");
  if (!layout.sideBetsAboveMain)
    throw new Error("Side bets are not above Blackjack");
  if (!layout.noRulesSidebar)
    throw new Error("The redundant rules sidebar is still present");
  if (layout.panelWidth < layout.viewportWidth * 0.8)
    throw new Error("The table does not use the released horizontal space");
  if (layout.horizontalOverflow)
    throw new Error("Desktop layout overflows horizontally");
  await page.screenshot({ path: "/tmp/minuit-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByTitle("Blackjack").click();
  await page.locator(".my-seat").waitFor();
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (mobileOverflow) throw new Error("Mobile layout overflows horizontally");
  await page.screenshot({ path: "/tmp/minuit-mobile.png", fullPage: true });

  console.log(JSON.stringify(layout));
} finally {
  await browser.close();
}

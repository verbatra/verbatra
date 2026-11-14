import { expect, type Page, test } from "playwright/test";
import { expectNoAxeViolations, homeUrl, openInTheme, THEMES } from "./support";

const WIDE = { width: 1440, height: 900 };

const FEATURES = ["extract", "types", "doctor", "watch", "handoff", "studio"] as const;

async function openDeck(page: Page): Promise<void> {
  await page.setViewportSize(WIDE);
  await page.goto(homeUrl("en"));
  await page.locator("#features").scrollIntoViewIfNeeded();
}

function pane(page: Page, id: string) {
  return page.locator(`#features .vk-deck-item:has(#feature-${id}) .vk-deck-pane`);
}

test.describe("feature deck pane switch", () => {
  test.use({ reducedMotion: "no-preference" });

  test("lifts a pane 8px while it fades in, on a switch only", async ({ page }) => {
    await openDeck(page);
    await expect(pane(page, "extract")).toHaveCSS("translate", "none");
    await expect(pane(page, "types")).toHaveCSS("translate", "0px 8px");
    await expect(pane(page, "types")).toHaveCSS("opacity", "0");
    await page
      .locator("#features .vk-deck-item:has(#feature-types) .vk-deck-row")
      .click({ position: { x: 200, y: 50 } });
    await expect(pane(page, "types")).toHaveCSS("translate", "none");
    await expect(pane(page, "types")).toHaveCSS("opacity", "1");
    await expect(pane(page, "extract")).toHaveCSS("translate", "0px 8px");
  });

  test("keeps the pane still under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDeck(page);
    await expect(pane(page, "types")).toHaveCSS("translate", "none");
    await expect(pane(page, "extract")).toHaveCSS("transition-duration", "0s");
  });
});

test.describe("feature deck", () => {
  test("shows the first command's artifact and hides the other five panes", async ({ page }) => {
    await openDeck(page);
    await expect(page.locator("#feature-extract")).toBeChecked();
    await expect(pane(page, "extract").locator(".vk-deck-card")).toBeVisible();
    await expect(page.locator("#features .vk-deck-card:visible")).toHaveCount(1);
    await expect(page.locator("#features .vk-deck-link:visible")).toHaveCount(1);
  });

  test("switches the pane on a click anywhere on a row", async ({ page }) => {
    await openDeck(page);
    for (const id of FEATURES) {
      await page
        .locator(`#features .vk-deck-item:has(#feature-${id}) .vk-deck-row`)
        .click({ position: { x: 200, y: 50 } });
      await expect(page.locator(`#feature-${id}`)).toBeChecked();
      await expect(pane(page, id).locator(".vk-deck-card")).toBeVisible();
      await expect(page.locator("#features .vk-deck-card:visible")).toHaveCount(1);
    }
    await expect(pane(page, "studio").locator("img:visible")).toHaveCount(1);
  });

  test("moves through the commands with the arrow keys and reaches the docs link by Tab", async ({
    page,
  }) => {
    await openDeck(page);
    await page.locator("#feature-extract").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#feature-types")).toBeChecked();
    await expect(page.locator("#feature-types")).toBeFocused();
    await expect(pane(page, "types").locator(".vk-deck-card")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(pane(page, "types").locator(".vk-deck-link")).toBeFocused();
  });

  test("keeps the section height when the pane changes", async ({ page }) => {
    await openDeck(page);
    const height = () => page.locator("#features").evaluate((node) => node.clientHeight);
    const before = await height();
    await page.locator("#feature-studio").check();
    await expect(pane(page, "studio").locator(".vk-deck-card")).toBeVisible();
    expect(await height()).toBe(before);
  });

  test("works with scripting disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: WIDE });
    const page = await context.newPage();
    await page.goto(homeUrl("en"));
    await page.locator("#feature-doctor").check();
    await expect(pane(page, "doctor").locator(".vk-deck-card")).toBeVisible();
    await expect(page.locator("#features .vk-deck-card:visible")).toHaveCount(1);
    await context.close();
  });

  for (const theme of THEMES) {
    test(`has no axe violations on the last pane in the ${theme} theme`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await openInTheme(page, homeUrl("en"), theme);
      await page.locator("#feature-handoff").check();
      await expect(pane(page, "handoff").locator(".vk-deck-card")).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

import { expect, type Page, test } from "playwright/test";
import { expectNoAxeViolations, homeUrl, openInTheme, THEMES } from "./support";

const WIDE = { width: 1440, height: 900 };

const DWELL_MS = 120;

const DECK = "#vk-deck-list";

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

  test("switches the pane on a click at the coordinates of the row's own command text", async ({
    page,
  }) => {
    await openDeck(page);
    for (const id of FEATURES) {
      const command = page.locator(`#features .vk-deck-item:has(#feature-${id}) .vk-deck-command`);
      await command.scrollIntoViewIfNeeded();
      const box = await command.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(40);
      await page.mouse.click(
        (box?.x ?? 0) + (box?.width ?? 0) / 2,
        (box?.y ?? 0) + (box?.height ?? 0) / 2,
      );
      await expect(page.locator(`#feature-${id}`)).toBeChecked();
      await expect(page.locator("#features .vk-deck-card:visible")).toHaveCount(1);
    }
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

function row(page: Page, id: string) {
  return page.locator(`#features .vk-deck-item:has(#feature-${id}) .vk-deck-row`);
}

async function center(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await row(page, id).boundingBox();
  return { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 };
}

async function hoverRow(page: Page, id: string): Promise<void> {
  const { x, y } = await center(page, id);
  await page.mouse.move(x, y);
}

async function openClockedDeck(page: Page): Promise<void> {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await openDeck(page);
  await expect(page.locator(DECK)).toHaveAttribute("data-deck-hover", "");
  await page.clock.pauseAt(new Date("2026-01-01T01:00:00Z"));
  await page.mouse.move(2, 2);
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test.describe(`feature deck hover select (${reducedMotion})`, () => {
    test.use({ reducedMotion });

    test("checks a row after the 120ms dwell and not a moment before", async ({ page }) => {
      await openClockedDeck(page);
      await hoverRow(page, "doctor");
      await page.clock.runFor(DWELL_MS - 5);
      await expect(page.locator("#feature-extract")).toBeChecked();
      await page.clock.runFor(10);
      await expect(page.locator("#feature-doctor")).toBeChecked();
      await expect(pane(page, "doctor").locator(".vk-deck-card")).toBeVisible();
      await expect(page.locator("#features .vk-deck-card:visible")).toHaveCount(1);
    });

    test("switches nothing for a fast sweep over all six rows", async ({ page }) => {
      await openClockedDeck(page);
      for (const id of FEATURES) {
        await hoverRow(page, id);
        await page.clock.runFor(50);
      }
      await expect(page.locator("#feature-extract")).toBeChecked();
      await page.mouse.move(2, 2);
      await page.clock.runFor(DWELL_MS * 3);
      await expect(page.locator("#feature-extract")).toBeChecked();
    });
  });
}

test.describe("feature deck hover select details", () => {
  test.use({ reducedMotion: "no-preference" });

  test("keeps the pane when the pointer travels from its row to the pane link", async ({
    page,
  }) => {
    await openClockedDeck(page);
    await hoverRow(page, "types");
    await page.clock.runFor(DWELL_MS + 5);
    await expect(page.locator("#feature-types")).toBeChecked();
    const link = await pane(page, "types").locator(".vk-deck-link").boundingBox();
    await page.mouse.move(
      (link?.x ?? 0) + (link?.width ?? 0) / 2,
      (link?.y ?? 0) + (link?.height ?? 0) / 2,
      { steps: 12 },
    );
    await page.clock.runFor(DWELL_MS * 3);
    await expect(page.locator("#feature-types")).toBeChecked();
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.className ?? "",
      {
        x: (link?.x ?? 0) + (link?.width ?? 0) / 2,
        y: (link?.y ?? 0) + (link?.height ?? 0) / 2,
      },
    );
    expect(hit).toContain("vk-deck-link");
  });

  test("keeps the last selection when the pointer leaves the deck", async ({ page }) => {
    await openClockedDeck(page);
    await hoverRow(page, "watch");
    await page.clock.runFor(DWELL_MS + 5);
    await page.mouse.move(2, 2);
    await page.clock.runFor(DWELL_MS * 3);
    await expect(page.locator("#feature-watch")).toBeChecked();
  });

  test("does not move focus, and the arrow keys continue from the focused radio", async ({
    page,
  }) => {
    await openClockedDeck(page);
    const { x, y } = await center(page, "extract");
    await page.mouse.click(x, y);
    await expect(page.locator("#feature-extract")).toBeFocused();
    await hoverRow(page, "handoff");
    await page.clock.runFor(DWELL_MS + 5);
    await expect(page.locator("#feature-handoff")).toBeChecked();
    await expect(page.locator("#feature-extract")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#feature-types")).toBeFocused();
    await expect(page.locator("#feature-types")).toBeChecked();
  });

  test("leaves a keyboard-focused radio alone", async ({ page }) => {
    await openClockedDeck(page);
    await page.locator("#feature-extract").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#feature-types")).toBeChecked();
    await hoverRow(page, "studio");
    await page.clock.runFor(DWELL_MS * 3);
    await expect(page.locator("#feature-types")).toBeChecked();
  });

  test("switches nothing when a wheel scroll moves rows under a still cursor", async ({ page }) => {
    await openClockedDeck(page);
    const deck = await page.locator(DECK).boundingBox();
    await page.mouse.move(120, 300);
    await page.evaluate(
      (top) => window.scrollTo({ top: top - 700, behavior: "instant" }),
      (deck?.y ?? 0) + (await page.evaluate(() => scrollY)),
    );
    await page.clock.runFor(50);
    await page.mouse.wheel(0, 500);
    await page.clock.runFor(DWELL_MS * 3);
    await expect(page.locator("#feature-extract")).toBeChecked();
  });
});

test.describe("feature deck on a touch device", () => {
  test.use({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
  });

  test("attaches no hover select and switches nothing without a tap", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.goto(homeUrl("en"));
    await expect(page.locator("[data-faq-keys]")).toHaveCount(1);
    await page.clock.runFor(1000);
    await expect(page.locator(DECK)).not.toHaveAttribute("data-deck-hover", "");
    await page.locator("#features").scrollIntoViewIfNeeded();
    await hoverRow(page, "doctor");
    await page.clock.runFor(DWELL_MS * 3);
    await expect(page.locator("#feature-extract")).toBeChecked();
  });
});

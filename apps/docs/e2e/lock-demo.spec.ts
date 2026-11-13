import { expect, type Page, type Route, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const DEMO = "section#lock-demo";
const FRAMES = `${DEMO} .vk-lock-frame`;

for (const locale of LOCALES) {
  test.describe(`lock-file demo ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme with the frames stacked`, async ({
        page,
      }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(DEMO).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(page, DEMO);
      });
    }

    for (const width of [320, 391]) {
      test(`stacks its three frames at ${width}px inside the viewport`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(homeUrl(locale));
        await expect(page.locator(FRAMES)).toHaveCount(3);
        for (const frame of await page.locator(FRAMES).all()) await expect(frame).toBeVisible();
        await expect(page.locator(`${DEMO} .vk-lock-steps`)).toBeHidden();
        await expectNoHorizontalScroll(page);
        await expectNothingPastRightEdge(page);
      });
    }
  });
}

test.describe("lock-file demo on a wide screen", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  for (const theme of THEMES) {
    test(`has no axe violations in the ${theme} theme on every frame`, async ({ page }) => {
      await openInTheme(page, homeUrl("en"), theme);
      await page.locator(DEMO).scrollIntoViewIfNeeded();
      for (const index of [0, 1, 2]) {
        await page.locator(`${DEMO} .vk-lock-step`).nth(index).click();
        await expect(page.locator(`${FRAMES}[data-active]`)).toHaveCount(1);
        await expect(page.locator(`${FRAMES}[data-active]`)).toHaveCSS("opacity", "1");
        await expectNoAxeViolations(page, DEMO);
      }
    });
  }

  test("plays one frame at a time, steps on click and pauses on its button", async ({ page }) => {
    await page.goto("/");
    const stage = page.locator(`${DEMO} .vk-lock-stage`);
    await page.locator(DEMO).scrollIntoViewIfNeeded();
    await expect(stage).toHaveAttribute("data-mode", "stage");
    await expect(page.locator(`${FRAMES}[data-active]`)).toHaveCount(1);
    const steps = page.locator(`${DEMO} .vk-lock-step`);
    await expect(steps.first()).toHaveAttribute("aria-current", "step");
    await steps.nth(2).click();
    await expect(page.locator(`${FRAMES}[data-active]`)).toHaveAttribute("id", "lock-demo-send");
    await expect(stage).toHaveAttribute("data-paused", "");
    await expect(page.locator(`${DEMO} .vk-lock-pause`)).toHaveText("Play animation");
    await page.locator(`${DEMO} .vk-lock-pause`).click();
    await expect(stage).not.toHaveAttribute("data-paused", "");
  });

  test("keeps the active card at its natural height instead of stretching it", async ({ page }) => {
    await page.goto("/");
    await page.locator(DEMO).scrollIntoViewIfNeeded();
    await page.locator(`${DEMO} .vk-lock-step`).nth(1).click();
    const { card, empty } = await page.evaluate(() => {
      const active = document.querySelector("#lock-demo .vk-lock-frame[data-active] .vk-lock-card");
      const body = active?.querySelector(".vk-lock-code") as HTMLElement | null;
      const last = body?.lastElementChild as HTMLElement | null;
      if (active === null || body === null || last === null) throw new Error("no active frame");
      return {
        card: active.getBoundingClientRect().bottom,
        empty: body.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom,
      };
    });
    expect(card).toBeGreaterThan(0);
    expect(empty).toBeLessThanOrEqual(16);
  });
});

test.describe("lock-file demo under reduced motion", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

  test("stays stacked and static with every frame shown", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(`${DEMO} .vk-lock-stage`)).not.toHaveAttribute("data-mode", "stage");
    for (const frame of await page.locator(FRAMES).all()) await expect(frame).toBeVisible();
    await expect(page.locator(`${DEMO} .vk-lock-pause`)).toBeHidden();
  });
});

const STAGE = `${DEMO} .vk-lock-stage`;
const STEPS = `${DEMO} .vk-lock-step`;
const PAUSE = `${DEMO} .vk-lock-pause`;
const ACTIVE = `${FRAMES}[data-active]`;

async function holdScripts(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  let holding = true;
  await page.route("**/_next/static/**", (route) => {
    if (holding && route.request().resourceType() === "script") held.push(route);
    else void route.continue();
  });
  return async () => {
    holding = false;
    await Promise.all(held.splice(0).map((route) => route.continue()));
  };
}

test.describe("lock-file demo without JavaScript on a wide screen", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    javaScriptEnabled: false,
  });

  test("stacks every frame with its caption and shows no step list or pause button", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(FRAMES)).toHaveCount(3);
    for (const frame of await page.locator(FRAMES).all()) await expect(frame).toBeVisible();
    for (const caption of await page.locator(`${DEMO} .vk-lock-caption`).all()) {
      await expect(caption).toBeVisible();
    }
    await expect(page.locator(`${DEMO} .vk-lock-steps`)).toBeHidden();
    await expect(page.locator(PAUSE)).toBeHidden();
  });
});

test.describe("lock-file demo motion in a real browser", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  test("advances to the next frame on its own once the first step's dwell has passed", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.goto("/");
    await page.locator(DEMO).scrollIntoViewIfNeeded();
    await expect(page.locator(STAGE)).toHaveAttribute("data-mode", "stage");
    await expect(page.locator(ACTIVE)).toHaveAttribute("id", "lock-demo-edit");
    await expect(page.locator(ACTIVE)).toHaveAttribute("id", "lock-demo-compare", {
      timeout: 12_000,
    });
    await expect(page.locator(STEPS).nth(1)).toHaveAttribute("aria-current", "step");
  });

  test("pauses while the section is offscreen and resumes when it is back", async ({ page }) => {
    await page.goto("/");
    await page.locator(DEMO).scrollIntoViewIfNeeded();
    await expect(page.locator(STAGE)).toHaveAttribute("data-mode", "stage");
    await expect(page.locator(STAGE)).not.toHaveAttribute("data-paused", "");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(STAGE)).toHaveAttribute("data-paused", "");
    await expect(page.locator(`${STEPS}[aria-current] .vk-lock-prog`)).toHaveCSS(
      "animation-play-state",
      "paused",
    );
    await page.locator(DEMO).scrollIntoViewIfNeeded();
    await expect(page.locator(STAGE)).not.toHaveAttribute("data-paused", "");
  });

  test("steps and pauses from the keyboard", async ({ page }) => {
    await page.goto("/");
    await page.locator(DEMO).scrollIntoViewIfNeeded();
    await expect(page.locator(STAGE)).toHaveAttribute("data-mode", "stage");
    await page.locator(STEPS).nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(ACTIVE)).toHaveAttribute("id", "lock-demo-compare");
    await expect(page.locator(STAGE)).toHaveAttribute("data-userpaused", "");
    await page.locator(PAUSE).focus();
    await page.keyboard.press("Space");
    await expect(page.locator(STAGE)).not.toHaveAttribute("data-userpaused", "");
    await page.keyboard.press("Space");
    await expect(page.locator(STAGE)).toHaveAttribute("data-userpaused", "");
    await expect(page.locator(PAUSE)).toHaveText("Play animation");
  });

  test("keeps the section where it is while the page hydrates", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const offset = () =>
      page.evaluate(() => ({
        highlights: document.querySelector("#highlights")?.getBoundingClientRect().top ?? -1,
        document: document.documentElement.scrollHeight,
      }));
    await expect(page.locator(STAGE)).not.toHaveAttribute("data-mode", "stage");
    await expect(page.locator(`${FRAMES}:first-child`)).toBeVisible();
    const before = await offset();
    await release();
    await expect(page.locator(STAGE)).toHaveAttribute("data-mode", "stage");
    const after = await offset();
    expect(Math.abs(after.highlights - before.highlights)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.document - before.document)).toBeLessThanOrEqual(1);
  });

  test("falls back to the stacked frames when the island never loads", async ({ page }) => {
    test.setTimeout(40_000);
    await page.route("**/_next/static/**", (route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue(),
    );
    await page.goto("/");
    await expect(page.locator(STAGE)).not.toHaveAttribute("data-mode", "stage");
    for (const frame of await page.locator(FRAMES).all()) {
      await expect(frame).toBeVisible({ timeout: 15_000 });
    }
    await expect(page.locator(`${DEMO} .vk-lock-steps`)).toBeHidden();
    await expectNoHorizontalScroll(page);
  });
});

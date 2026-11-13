import { expect, test } from "playwright/test";
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
      test(`has no axe violations in the ${theme} theme, stacked and staged`, async ({ page }) => {
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

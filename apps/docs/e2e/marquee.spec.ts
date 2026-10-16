import { expect, type Locator, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const MARQUEE = "section#marquee";
const FIRST_LIST = `${MARQUEE} [data-row="providers"] .vk-marquee-list:not(.vk-marquee-copy)`;

async function playStates(page: Page): Promise<ReadonlyArray<string>> {
  return page
    .locator(`${MARQUEE} .vk-marquee-list`)
    .evaluateAll((lists) =>
      lists.flatMap((list) => list.getAnimations().map((animation) => animation.playState)),
    );
}

async function offset(list: Locator): Promise<number> {
  return list.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
}

async function expectStatic(page: Page): Promise<void> {
  const marquee = page.locator(MARQUEE);
  await expect(marquee.locator(".vk-marquee-toggle")).toBeHidden();
  for (const copy of await marquee.locator(".vk-marquee-copy").all())
    await expect(copy).toBeHidden();
  await expect(page.locator(FIRST_LIST)).toHaveCSS("flex-wrap", "wrap");
  expect(await playStates(page)).toEqual([]);
}

for (const locale of LOCALES) {
  test.describe(`marquee ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await expectNoAxeViolations(page, MARQUEE);
      });
    }
  });
}

test.describe("marquee under reduced motion", () => {
  test("shows one static, wrapped copy of each row and no pause button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
    await expectStatic(page);
  });
});

test.describe("marquee without JavaScript", () => {
  test.use({ javaScriptEnabled: false, reducedMotion: "no-preference" });

  test("never moves and shows no pause button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(FIRST_LIST)).toBeVisible();
    await expectStatic(page);
  });
});

test.describe("marquee motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("runs after hydration and stops while the pause button is pressed", async ({ page }) => {
    await page.goto("/");
    const marquee = page.locator(".vk-marquee");
    await expect(marquee).toHaveAttribute("data-marquee", "running");
    const toggle = marquee.locator(".vk-marquee-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => playStates(page)).toContain("running");

    await toggle.click();
    await page.mouse.move(0, 0);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(marquee).toHaveAttribute("data-marquee", "paused");
    await expect.poll(async () => new Set(await playStates(page))).toEqual(new Set(["paused"]));
    const list = page.locator(FIRST_LIST);
    const before = await offset(list);
    await page.waitForTimeout(300);
    expect(await offset(list)).toBe(before);

    await toggle.click();
    await page.mouse.move(0, 0);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => new Set(await playStates(page))).toEqual(new Set(["running"]));
  });

  test("pauses a row while focus is on its link", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
    await page.locator(`${MARQUEE} [data-row="formats"] .vk-marquee-more`).focus();
    const states = () =>
      page
        .locator(`${MARQUEE} [data-row="formats"] .vk-marquee-list`)
        .evaluateAll((lists) => lists.flatMap((l) => l.getAnimations().map((a) => a.playState)));
    await expect.poll(async () => new Set(await states())).toEqual(new Set(["paused"]));
  });

  for (const theme of THEMES) {
    test(`has no axe violations while moving in the ${theme} theme`, async ({ page }) => {
      await openInTheme(page, homeUrl("en"), theme);
      await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
      await expectNoAxeViolations(page, MARQUEE);
    });
  }

  test("reflows at 320px without horizontal scroll while moving", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
    await expect(page.locator(`${MARQUEE} .vk-marquee-copy`).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test("the static marquee reflows at 320px without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await expectStatic(page);
  await expectNoHorizontalScroll(page);
});

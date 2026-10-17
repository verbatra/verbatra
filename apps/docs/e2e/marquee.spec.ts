import { expect, type Page, type Route, test } from "playwright/test";
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

async function marqueeTimesTwoFramesApart(
  page: Page,
): Promise<ReadonlyArray<readonly [number | null, number | null]>> {
  return page.evaluate(async () => {
    const marquee = document.querySelector("#marquee");
    const animations = document
      .getAnimations()
      .filter(
        (animation): animation is CSSAnimation =>
          animation instanceof CSSAnimation &&
          animation.animationName === "vk-marquee" &&
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target instanceof Element &&
          marquee?.contains(animation.effect.target) === true,
      );
    const time = (animation: Animation) =>
      typeof animation.currentTime === "number" ? animation.currentTime : null;
    const before = animations.map(time);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 100));
    return animations.map((animation, index) => [before[index] ?? null, time(animation)] as const);
  });
}

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

async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shifts: Array<{ startTime: number; value: number }> = [];
    Object.assign(window, { __marqueeShifts: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) shifts.push({ startTime: shift.startTime, value: shift.value });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function shiftSince(page: Page, since: number): Promise<number> {
  const shifts = await page.evaluate(
    () =>
      (window as unknown as { __marqueeShifts?: Array<{ startTime: number; value: number }> })
        .__marqueeShifts,
  );
  if (shifts === undefined) throw new Error("the layout-shift observer never started");
  return shifts
    .filter((shift) => shift.startTime >= since)
    .reduce((sum, shift) => sum + shift.value, 0);
}

async function sectionHeight(page: Page): Promise<number> {
  return page.locator(MARQUEE).evaluate((element) => element.getBoundingClientRect().height);
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

  test("never moves, shows no pause button and wraps every item into view", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => matchMedia("(scripting: none)").matches)).toBe(true);
    await expect(page.locator(FIRST_LIST)).toBeVisible();
    await expectStatic(page);
  });
});

test.describe("marquee before the island takes over", () => {
  test.use({ reducedMotion: "no-preference" });

  test("reserves the hidden pause button and keeps every item reachable in one scrolling line", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await holdScripts(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const marquee = page.locator(".vk-marquee");
    await expect(marquee).not.toHaveAttribute("data-marquee", /.*/);
    const toggle = marquee.locator(".vk-marquee-toggle");
    await expect(toggle).toHaveCSS("visibility", "hidden");
    await expect(toggle).not.toHaveCSS("display", "none");
    expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.locator(FIRST_LIST)).toHaveCSS("flex-wrap", "nowrap");
    const formats = page.locator(`${MARQUEE} [data-row="formats"] .vk-marquee-viewport`);
    await expect(formats).toHaveAttribute("tabindex", "0");
    await expect(formats).toHaveAccessibleName(/.+/);
    await expectNoHorizontalScroll(page);
    await formats.focus();
    await formats.press("ArrowRight");
    await expect.poll(() => formats.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });

  for (const width of [375, 1440]) {
    test(`keeps the section height and shifts nothing when the motion starts at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await observeLayoutShift(page);
      const release = await holdScripts(page);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.locator(MARQUEE).scrollIntoViewIfNeeded();
      await expect(page.locator(".vk-marquee")).not.toHaveAttribute("data-marquee", /.*/);
      const before = await sectionHeight(page);

      const releasedAt = await page.evaluate(() => performance.now());
      await release();
      await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
      await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
      await expect(page.locator(".vk-marquee-toggle")).toBeVisible();
      await expect.poll(() => playStates(page)).toContain("running");
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const after = await sectionHeight(page);
      test.info().annotations.push({
        type: "marquee-height",
        description: `${width}px: ${before} before, ${after} after`,
      });
      expect(after).toBe(before);
      const shift = await shiftSince(page, releasedAt);
      test.info().annotations.push({ type: "marquee-cls", description: `${width}px: ${shift}` });
      expect(shift).toBe(0);
    });
  }
});

test.describe("marquee motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("runs after hydration and stops until the button, renamed to play, is pressed again", async ({
    page,
  }) => {
    await page.goto("/");
    const marquee = page.locator(".vk-marquee");
    await expect(marquee).toHaveAttribute("data-marquee", "running");
    const toggle = marquee.locator(".vk-marquee-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAccessibleName("Pause animation");
    await expect(toggle).not.toHaveAttribute("aria-pressed");
    await expect.poll(() => playStates(page)).toContain("running");

    await toggle.click();
    await page.mouse.move(0, 0);
    await expect(toggle).toHaveAccessibleName("Play animation");
    await expect(marquee).toHaveAttribute("data-marquee", "paused");
    await expect.poll(async () => new Set(await playStates(page))).toEqual(new Set(["paused"]));
    const paused = await marqueeTimesTwoFramesApart(page);
    expect(paused.length).toBeGreaterThan(0);
    for (const [first, second] of paused) {
      expect(first).not.toBeNull();
      expect(second).toBe(first);
    }

    await toggle.click();
    await page.mouse.move(0, 0);
    await expect(toggle).toHaveAccessibleName("Pause animation");
    await expect.poll(async () => new Set(await playStates(page))).toEqual(new Set(["running"]));
    const running = await marqueeTimesTwoFramesApart(page);
    expect(running.length).toBeGreaterThan(0);
    for (const [first, second] of running) expect(second).not.toBe(first);
  });

  test("glints the release pill three times only once the marquee is in view", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto("/");
    const marquee = page.locator(".vk-marquee");
    await expect(marquee).toHaveAttribute("data-marquee", "running");
    const pill = marquee.locator(".vk-marquee-list:not(.vk-marquee-copy) .vk-pill-new").first();
    const glow = () =>
      pill.evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return [style.animationName, style.animationIterationCount];
      });
    await expect(marquee).not.toHaveAttribute("data-glint");
    expect((await glow())[0]).toBe("none");
    await marquee.scrollIntoViewIfNeeded();
    await expect(marquee).toHaveAttribute("data-glint", "on");
    expect(await glow()).toEqual(["vk-pill-new-glow", "3"]);
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

test.describe("marquee layout at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sets the heading at the start of the band and the rows beside it at the end", async ({
    page,
  }) => {
    await page.goto("/");
    const head = page.locator(`${MARQUEE} .vk-section-head`);
    await expect(head).toHaveAttribute("data-layout", "aside");
    const headBox = await head.boundingBox();
    const rows = await page.locator(`${MARQUEE} .vk-section-aside-content`).boundingBox();
    if (headBox === null || rows === null) throw new Error("no box");
    expect(rows.x).toBeGreaterThan(headBox.x + headBox.width);
    expect(rows.width).toBeGreaterThan(headBox.width * 1.5);
    expect(Math.abs(rows.y - headBox.y)).toBeLessThanOrEqual(2);
    await expectNoAxeViolations(page, MARQUEE);
  });
});

for (const width of [1024, 1440]) {
  for (const locale of LOCALES) {
    test(`caps the side-column heading at four lines at ${width}px in ${locale}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(homeUrl(locale));
      const lines = await page.locator("#marquee-heading").evaluate((heading) => {
        const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
        return Math.round(heading.getBoundingClientRect().height / lineHeight);
      });
      expect(lines).toBeGreaterThan(0);
      expect(lines).toBeLessThanOrEqual(4);
    });
  }
}

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

type LoopFrame = {
  readonly row: string;
  readonly at: number;
  readonly startSpread: number;
  readonly spans: ReadonlyArray<readonly [number, number]>;
};

async function loopFrames(page: Page): Promise<ReadonlyArray<LoopFrame>> {
  return page.evaluate(async () => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("#marquee .vk-marquee-row"));
    const frames: Array<LoopFrame> = [];
    for (const row of rows) {
      const lists = Array.from(row.querySelectorAll<HTMLElement>(".vk-marquee-list"));
      const animations = lists.flatMap((list) => list.getAnimations());
      await Promise.all(animations.map((animation) => animation.ready));
      const starts = animations.map((animation) => Number(animation.startTime));
      const startSpread = Math.max(...starts) - Math.min(...starts);
      const first = Number(animations[0]?.currentTime);
      const offsets = animations.map((animation) => Number(animation.currentTime) - first);
      const duration = Number(animations[0]?.effect?.getComputedTiming().duration ?? 0);
      for (const at of [0, 0.25, 0.5, 0.75, 0.999]) {
        animations.forEach((animation, index) => {
          animation.pause();
          animation.currentTime = duration + duration * at + (offsets[index] ?? 0);
        });
        const spans = lists.map((list) => {
          const box = list.getBoundingClientRect();
          return [box.left, box.right] as const;
        });
        frames.push({ row: row.dataset.row ?? "", at, startSpread, spans });
      }
    }
    return frames;
  });
}

const MARQUEE_GAP_PX = 14;

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

const PHONE = { width: 391, height: 844 } as const;

async function expectScrollingLines(page: Page): Promise<void> {
  expect(await sectionHeight(page)).toBeLessThanOrEqual(PHONE.height / 2);
  for (const id of ["formats", "providers"]) {
    const row = page.locator(`${MARQUEE} [data-row="${id}"]`);
    const list = row.locator(".vk-marquee-list:not(.vk-marquee-copy)");
    const viewport = row.locator(".vk-marquee-viewport");
    await expect(list).toHaveCSS("flex-wrap", "nowrap");
    const lineHeight = await list.evaluate((element) => element.getBoundingClientRect().height);
    expect(lineHeight).toBeLessThan(56);
    const sizes = await viewport.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    await viewport.focus();
    await viewport.press("ArrowRight");
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect(viewport).toHaveCSS("outline-style", "solid");
    await expect(viewport).toHaveCSS("outline-offset", "-2px");
    const lastVisible = await viewport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      const items = element.querySelectorAll(".vk-marquee-list:not(.vk-marquee-copy) > li");
      const last = items[items.length - 1]?.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const gutter = Number.parseFloat(getComputedStyle(element).paddingLeft);
      return (
        gutter > 0 &&
        last !== undefined &&
        last.left >= box.left &&
        last.right <= box.right - gutter + 1
      );
    });
    expect(lastVisible, `${id} last item reachable`).toBe(true);
  }
  expect(await playStates(page)).toEqual([]);
  await expectNoHorizontalScroll(page);
}

test.describe("marquee under reduced motion on a phone", () => {
  test.use({ viewport: PHONE });

  test("stays under half a screen as one scrolling line per row with every item reachable", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
    await expect(page.locator(".vk-marquee-toggle")).toBeHidden();
    await expectScrollingLines(page);
    await expectNoAxeViolations(page, MARQUEE);
  });
});

test.describe("marquee when the motion preference changes at runtime", () => {
  test("adds no copy while motion is reduced, then starts every list of a row in step", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
    await expect(page.locator(`${MARQUEE} .vk-marquee-copy`)).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator(`${MARQUEE} .vk-marquee-copy`)).toHaveCount(4);
    await expect.poll(() => playStates(page)).toContain("running");
    await page.waitForTimeout(400);
    const spread = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#marquee .vk-marquee-track"), (track) => {
        const starts = Array.from(track.children, (list) =>
          Number((list as HTMLElement).getAnimations()[0]?.startTime ?? Number.NaN),
        );
        return Math.max(...starts) - Math.min(...starts);
      }),
    );
    for (const difference of spread) expect(difference).toBe(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(`${MARQUEE} .vk-marquee-copy`)).toHaveCount(0);
  });
});

test.describe("marquee without JavaScript on a phone", () => {
  test.use({ javaScriptEnabled: false, reducedMotion: "no-preference", viewport: PHONE });

  test("stays under half a screen as one scrolling line per row with every item reachable", async ({
    page,
  }) => {
    await page.goto("/");
    await expectScrollingLines(page);
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

  for (const width of [1440, 1920, 2560]) {
    test(`keeps every row filled edge to edge across the whole loop at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
      await expect(page.locator(`${MARQUEE} .vk-marquee-copy`).first()).toBeVisible();
      const frames = await loopFrames(page);
      expect(frames).toHaveLength(10);
      for (const { row, at, startSpread, spans } of frames) {
        const label = `${row} at ${at} of the loop`;
        expect(startSpread, `${label}: start times`).toBe(0);
        const ordered = [...spans].sort(([first], [second]) => first - second);
        expect(ordered[0]?.[0] ?? 1, label).toBeLessThanOrEqual(0);
        expect(Math.max(...ordered.map(([, end]) => end)), label).toBeGreaterThanOrEqual(width);
        for (let index = 1; index < ordered.length; index += 1) {
          const gap = (ordered[index]?.[0] ?? 0) - (ordered[index - 1]?.[1] ?? 0);
          expect(gap, `${label}: between list ${index - 1} and ${index}`).toBeGreaterThanOrEqual(
            MARQUEE_GAP_PX - 1,
          );
          expect(gap, `${label}: between list ${index - 1} and ${index}`).toBeLessThanOrEqual(
            MARQUEE_GAP_PX + 1,
          );
        }
      }
    });
  }

  test("draws each item as a bare mark and label with no border or fill", async ({ page }) => {
    await page.goto("/");
    const item = page.locator(`${MARQUEE} .vk-marquee-item`).first();
    await expect(item).toHaveCSS("border-top-width", "0px");
    await expect(item).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator(`${MARQUEE} .vk-marquee-toggle`)).toHaveCSS(
      "border-top-width",
      "0px",
    );
  });

  test("pauses a row while focus is inside it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
    await page.locator(`${MARQUEE} [data-row="formats"] .vk-marquee-viewport`).focus();
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

test("the static marquee reflows at 1024px without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/");
  await expectStatic(page);
  await expectNoHorizontalScroll(page);
});

for (const width of [640, 768, 1023]) {
  test(`the static marquee wraps its rows into several lines at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expectStatic(page);
    const lineHeight = await page
      .locator(`${FIRST_LIST} > li`)
      .first()
      .evaluate((item) => item.getBoundingClientRect().height);
    const listHeight = await page
      .locator(FIRST_LIST)
      .evaluate((list) => list.getBoundingClientRect().height);
    expect(listHeight).toBeGreaterThan(lineHeight * 1.5);
    await expectNoHorizontalScroll(page);
  });
}

test("the static marquee at 320px scrolls inside its rows, not the page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await expect(page.locator(".vk-marquee-toggle")).toBeHidden();
  await expect(page.locator(FIRST_LIST)).toHaveCSS("flex-wrap", "nowrap");
  expect(await playStates(page)).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test.describe("marquee layout at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("centres the heading over two full-width rows, formats above providers", async ({
    page,
  }) => {
    await page.goto("/");
    const heading = await page.locator("#marquee-heading").boundingBox();
    const formats = await page.locator(`${MARQUEE} [data-row="formats"]`).boundingBox();
    const providers = await page.locator(`${MARQUEE} [data-row="providers"]`).boundingBox();
    const links = await page.locator(`${MARQUEE} .vk-marquee-links`).boundingBox();
    if (heading === null || formats === null || providers === null || links === null)
      throw new Error("no box");
    const center = (box: { x: number; width: number }) => box.x + box.width / 2;
    expect(Math.abs(center(heading) - center(formats))).toBeLessThanOrEqual(2);
    expect(Math.abs(center(links) - center(formats))).toBeLessThanOrEqual(2);
    expect(formats.width).toBeGreaterThan(900);
    const section = await page.locator(MARQUEE).boundingBox();
    if (section === null) throw new Error("no section box");
    expect(formats.x).toBeLessThanOrEqual(1);
    expect(formats.width).toBeGreaterThanOrEqual(section.width - 2);
    await expect(page.locator(MARQUEE)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator(MARQUEE)).toHaveCSS("border-top-width", "1px");
    await expect(page.locator(MARQUEE)).toHaveCSS("border-bottom-width", "1px");
    expect(providers.width).toBeCloseTo(formats.width, 0);
    expect(heading.y + heading.height).toBeLessThanOrEqual(formats.y);
    expect(formats.y + formats.height).toBeLessThanOrEqual(providers.y);
    expect(providers.y + providers.height).toBeLessThanOrEqual(links.y);
    await expectNoAxeViolations(page, MARQUEE);
  });

  test("scrolls the formats and providers rows in opposite directions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.locator(".vk-marquee")).toHaveAttribute("data-marquee", "running");
    const directions = await page
      .locator(`${MARQUEE} .vk-marquee-list:not(.vk-marquee-copy)`)
      .evaluateAll((lists) => lists.map((list) => getComputedStyle(list).animationDirection));
    expect(directions).toEqual(["normal", "reverse"]);
  });
});

for (const width of [1024, 1440]) {
  for (const locale of LOCALES) {
    test(`keeps the centred heading on a single line at ${width}px in ${locale}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(homeUrl(locale));
      const lines = await page.locator("#marquee-heading").evaluate((heading) => {
        const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
        return Math.round(heading.getBoundingClientRect().height / lineHeight);
      });
      expect(lines).toBeGreaterThan(0);
      expect(lines).toBe(1);
    });
  }
}

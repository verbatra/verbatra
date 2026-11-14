import { expect, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const SECTION = "section#gate";
const FRAMES = `${SECTION} .vk-gate-frame`;
const HEADER = 56;
const STATES = ["candidate", "refused", "stale"] as const;
const SCAN_STEP = 4;

type Sample = {
  at: number;
  opacity: number[];
  visibility: string[];
  done: boolean[];
  headingTop: number;
  headingBottom: number;
};

async function installShiftCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shifts = { total: 0 };
    (window as unknown as { shifts: typeof shifts }).shifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) shifts.total += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function layoutShift(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { shifts: { total: number } }).shifts.total);
}

async function openStaged(page: Page, locale: (typeof LOCALES)[number] = "en"): Promise<void> {
  await page.goto(homeUrl(locale), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".vk-scroll-top-sentinel")).toBeAttached();
}

async function scan(page: Page): Promise<Sample[]> {
  return page.evaluate(
    async ([header, step]) => {
      const track = document.querySelector(".vk-gate-track");
      const heading = document.querySelector("#gate-heading");
      if (!track || !heading) throw new Error("no gate");
      const start = track.getBoundingClientRect().top + window.scrollY - header;
      const range = 1.2 * innerHeight;
      const frames = [...document.querySelectorAll(".vk-gate-frame")];
      const moves = frames.map((frame) => frame.querySelector(".vk-gate-moves"));
      const samples: Sample[] = [];
      for (let y = Math.max(0, start - 40); y <= start + range + 40; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const box = heading.getBoundingClientRect();
        samples.push({
          at: y - start,
          opacity: frames.map((frame) => Number(getComputedStyle(frame).opacity)),
          visibility: frames.map((frame) => getComputedStyle(frame).visibility),
          done: frames.map((_, index) => {
            const style = getComputedStyle(moves[index] as Element);
            return (
              Number(style.opacity) === 1 &&
              (style.transform === "none" || style.transform === "matrix(1, 0, 0, 1, 0, 0)")
            );
          }),
          headingTop: box.top,
          headingBottom: box.bottom,
        });
      }
      return samples;
    },
    [HEADER, SCAN_STEP] as const,
  );
}

function completeDistance(samples: Sample[], state: number): number {
  return (
    samples.filter(
      (sample) =>
        sample.opacity[state] === 1 && sample.visibility[state] === "visible" && sample.done[state],
    ).length * SCAN_STEP
  );
}

for (const [width, height] of [
  [1440, 900],
  [1280, 720],
] as const) {
  test.describe(`gate pinned at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

    test("pins one sticky stage and holds every state complete for at least 200px", async ({
      page,
    }) => {
      await openStaged(page);
      await expect(page.locator(`${SECTION} .vk-gate-pin`)).toHaveCSS("position", "sticky");
      const samples = await scan(page);
      for (const [index, state] of STATES.entries()) {
        expect(completeDistance(samples, index), state).toBeGreaterThanOrEqual(200);
      }
    });

    test("never shows two frames at once and hides the frames that are not current", async ({
      page,
    }) => {
      await openStaged(page);
      const samples = await scan(page);
      for (const sample of samples) {
        const sorted = [...sample.opacity].sort((a, b) => b - a);
        expect(sorted[1] ?? 0, `at ${sample.at}`).toBeLessThanOrEqual(0.1);
        sample.opacity.forEach((opacity, index) => {
          if (opacity > 0.1) expect(sample.visibility[index]).toBe("visible");
        });
      }
      const holds = STATES.map((_, index) =>
        samples.find((s) => s.opacity[index] === 1 && s.done[index]),
      );
      holds.forEach((hold, index) => {
        expect(hold, STATES[index]).toBeDefined();
        hold?.visibility.forEach((visibility, other) => {
          if (other !== index) expect(visibility).toBe("hidden");
        });
      });
    });

    test("keeps the heading in view while the stage is pinned and shifts no layout", async ({
      page,
    }) => {
      await installShiftCounter(page);
      await openStaged(page);
      const samples = await scan(page);
      const pinned = samples.filter((sample) => sample.at >= 0 && sample.at <= 1.2 * height);
      for (const sample of pinned) {
        expect(sample.headingTop, `at ${sample.at}`).toBeGreaterThanOrEqual(HEADER);
        expect(sample.headingBottom, `at ${sample.at}`).toBeLessThanOrEqual(height);
      }
      expect(await layoutShift(page)).toBe(0);
    });

    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme on every state`, async ({ page }) => {
        await openInTheme(page, homeUrl("en"), theme);
        await page.evaluate(() => document.fonts.ready);
        const range = 1.2 * height;
        const startY = await page.evaluate(
          (header) =>
            (document.querySelector(".vk-gate-track")?.getBoundingClientRect().top ?? 0) +
            window.scrollY -
            header,
          HEADER,
        );
        for (const [index, svh] of [20, 60, 105].entries()) {
          await page.evaluate((y) => window.scrollTo(0, y), startY + (svh / 120) * range);
          await expect(page.locator(FRAMES).nth(index)).toHaveCSS("opacity", "1");
          await expectNoAxeViolations(page, SECTION);
        }
      });
    }
  });
}

for (const locale of LOCALES) {
  for (const [width, height] of [
    [1024, 672],
    [1280, 720],
  ] as const) {
    test.describe(`gate fit ${homeUrl(locale)} at ${width}x${height}`, () => {
      test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

      test("keeps the heading and the whole current card inside the viewport during every hold", async ({
        page,
      }) => {
        await openStaged(page, locale);
        const fits = await page.evaluate(
          async ([header]) => {
            const track = document.querySelector(".vk-gate-track");
            const heading = document.querySelector("#gate-heading");
            if (!track || !heading) throw new Error("no gate");
            const start = track.getBoundingClientRect().top + window.scrollY - header;
            const results: {
              svh: number;
              headingTop: number;
              cardBottom: number;
              viewport: number;
            }[] = [];
            for (const svh of [20, 60, 105]) {
              window.scrollTo(0, start + (svh / 100) * innerHeight);
              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              );
              const card = [...document.querySelectorAll(".vk-gate-frame")]
                .filter((frame) => getComputedStyle(frame).visibility === "visible")
                .map((frame) => frame.querySelector(".vk-gate-card")?.getBoundingClientRect())[0];
              results.push({
                svh,
                headingTop: heading.getBoundingClientRect().top,
                cardBottom: card?.bottom ?? Number.POSITIVE_INFINITY,
                viewport: innerHeight,
              });
            }
            return results;
          },
          [HEADER] as const,
        );
        for (const fit of fits) {
          expect(fit.headingTop, `heading at ${fit.svh}`).toBeGreaterThanOrEqual(HEADER);
          expect(fit.cardBottom, `card at ${fit.svh}`).toBeLessThanOrEqual(fit.viewport);
        }
      });
    });
  }
}

test.describe("gate with the scroll timeline out of reach", () => {
  test.use({ viewport: { width: 1440, height: 600 }, reducedMotion: "no-preference" });

  test("stacks the frames, reveals the one moving element of each once and shifts no layout", async ({
    page,
  }) => {
    await installShiftCounter(page);
    await openStaged(page);
    await expect(page.locator(`${SECTION} .vk-gate-pin`)).not.toHaveCSS("position", "sticky");
    for (const frame of await page.locator(FRAMES).all()) await expect(frame).toBeVisible();
    for (const moves of await page.locator(`${FRAMES} .vk-gate-moves`).all()) {
      await moves.scrollIntoViewIfNeeded();
      await expect(moves).toHaveAttribute("data-revealed", "");
      await expect(moves).toHaveCSS("opacity", "1");
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await layoutShift(page)).toBe(0);
  });
});

test.describe("gate below 64rem", () => {
  test.use({ viewport: { width: 800, height: 900 }, reducedMotion: "no-preference" });

  test("stacks static frames with no scroll-linked animation", async ({ page }) => {
    await openStaged(page);
    for (const frame of await page.locator(FRAMES).all()) {
      await expect(frame).toHaveCSS("animation-name", "none");
      await expect(frame).toHaveCSS("opacity", "1");
      await expect(frame).toHaveCSS("visibility", "visible");
    }
    const track = await page.locator(`${SECTION} .vk-gate-track`).boundingBox();
    expect(track?.height ?? 0).toBeLessThan(1500);
  });
});

test.describe("gate with reduced motion", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

  test("shows the three end states stacked, one state per value, at their static height", async ({
    page,
    browser,
  }) => {
    await openStaged(page);
    const frames = await page.locator(FRAMES).all();
    expect(frames).toHaveLength(3);
    for (const frame of frames) {
      await expect(frame).toBeVisible();
      await expect(frame).toHaveCSS("opacity", "1");
    }
    for (const moves of await page.locator(`${FRAMES} .vk-gate-moves`).all()) {
      await expect(moves).toHaveCSS("opacity", "1");
      await expect(moves).toHaveCSS("transform", "none");
    }
    const text = (await page.locator(SECTION).textContent()) ?? "";
    expect(text.split("Willkommen zurück!")).toHaveLength(2);
    expect(text.split("Willkommen, {name}!")).toHaveLength(2);
    await expect(page.locator(`${SECTION} .vk-gate-pin`)).not.toHaveCSS("position", "sticky");

    const noScript = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: false,
      reducedMotion: "no-preference",
    });
    const bare = await noScript.newPage();
    await bare.goto(homeUrl("en"));
    await expect(bare.locator(`${SECTION} .vk-gate-pin`)).not.toHaveCSS("position", "sticky");
    for (const frame of await bare.locator(FRAMES).all()) {
      await expect(frame).toBeVisible();
      await expect(frame).toHaveCSS("opacity", "1");
    }
    expect(
      ((await bare.locator(SECTION).textContent()) ?? "").split("Willkommen zurück!"),
    ).toHaveLength(2);
    await noScript.close();
  });

  test("shifts no layout while scrolling the stacked frames", async ({ page }) => {
    await installShiftCounter(page);
    await openStaged(page);
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await layoutShift(page)).toBe(0);
  });

  test("paints the stacked end state with the exit code in the danger colour", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(`${SECTION} .vk-gate-exit`)).toHaveText("exit 1");
    const colour = await page
      .locator(`${SECTION} .vk-gate-exit`)
      .evaluate((node) => getComputedStyle(node).color);
    const danger = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--text-danger)";
      document.body.append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    });
    expect(colour).toBe(danger);
  });
});

for (const locale of LOCALES) {
  test.describe(`gate ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme with the frames stacked`, async ({
        page,
      }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(SECTION).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(page, SECTION);
      });
    }

    for (const width of [320, 375]) {
      test(`reflows at ${width}px inside the viewport`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(homeUrl(locale));
        await expect(page.locator(FRAMES)).toHaveCount(3);
        for (const frame of await page.locator(FRAMES).all()) await expect(frame).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectNothingPastRightEdge(page);
      });
    }
  });
}

test.describe("gate on a phone", () => {
  test.use({ viewport: { width: 391, height: 844 } });

  for (const motion of ["no-preference", "reduce"] as const) {
    test(`stays at most 1300px tall with motion ${motion}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto("/");
      const height = await page
        .locator(SECTION)
        .evaluate((node) => node.getBoundingClientRect().height);
      expect(height).toBeLessThanOrEqual(1300);
    });
  }

  test("reveals each frame's moving element once, within 600ms and 16px", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installShiftCounter(page);
    await openStaged(page);
    for (const moves of await page.locator(`${FRAMES} .vk-gate-moves`).all()) {
      const timing = await moves.evaluate((node) => {
        const style = getComputedStyle(node);
        return { duration: style.transitionDuration, delay: style.transitionDelay };
      });
      expect(Number.parseFloat(timing.duration.split(",")[0] ?? "0")).toBeLessThanOrEqual(0.6);
      expect(Number.parseFloat(timing.delay.split(",")[0] ?? "0")).toBeLessThanOrEqual(0.35);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await layoutShift(page)).toBe(0);
  });
});

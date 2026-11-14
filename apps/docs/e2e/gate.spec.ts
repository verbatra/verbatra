import { expect, type Page, test } from "playwright/test";
import { GATE_FADE_SVH, GATE_HOLD_SVH, GATE_PIN_SVH, GATE_SCHEDULE } from "@/lib/gate-timeline";
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
const MOVES = `${FRAMES} .vk-gate-moves`;
const HEADER = 56;
const STATES = ["candidate", "refused", "stale"] as const;
const SCAN_STEP = 4;
const HOLD_FLOOR_PX = 220;
const FREE_SPACE_TOLERANCE = 24;
const CARD_SPREAD_LIMIT = 60;

type Sample = {
  at: number;
  opacity: number[];
  events: string[];
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

async function pinStart(page: Page): Promise<number> {
  return page.evaluate(
    (header) =>
      (document.querySelector(".vk-gate-track")?.getBoundingClientRect().top ?? 0) +
      window.scrollY -
      header,
    HEADER,
  );
}

async function scrollToSvh(page: Page, svh: number): Promise<void> {
  const start = await pinStart(page);
  await page.evaluate(
    async ([y]) => {
      window.scrollTo(0, y as number);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
    [start + (svh / 100) * (page.viewportSize()?.height ?? 0)],
  );
}

async function scan(page: Page): Promise<Sample[]> {
  return page.evaluate(
    async ([header, step, pin]) => {
      const track = document.querySelector(".vk-gate-track");
      const heading = document.querySelector("#gate-heading");
      if (!track || !heading) throw new Error("no gate");
      const start = track.getBoundingClientRect().top + window.scrollY - header;
      const range = (pin / 100) * innerHeight;
      const frames = [...document.querySelectorAll(".vk-gate-frame")];
      const moves = frames.map((frame) => frame.querySelector(".vk-gate-moves"));
      const samples: Sample[] = [];
      for (let y = start; y <= start + range; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const box = heading.getBoundingClientRect();
        samples.push({
          at: y - start,
          opacity: frames.map((frame) => Number(getComputedStyle(frame).opacity)),
          events: frames.map((frame) => getComputedStyle(frame).pointerEvents),
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
    [HEADER, SCAN_STEP, GATE_PIN_SVH] as const,
  );
}

function completeDistance(samples: Sample[], state: number): number {
  return (
    samples.filter(
      (sample) =>
        sample.opacity[state] === 1 && sample.events[state] === "auto" && sample.done[state],
    ).length * SCAN_STEP
  );
}

type Free = { state: string; above: number; below: number; card: number };

async function freeSpace(page: Page): Promise<Free[]> {
  const frees: Free[] = [];
  for (const [index, state] of STATES.entries()) {
    const frame = GATE_SCHEDULE.frames[index];
    const svh = (frame?.build[1] ?? 0) + GATE_HOLD_SVH / 2;
    await scrollToSvh(page, svh);
    frees.push(
      await page.evaluate(
        ([name, header]) => {
          const card = document
            .querySelector(`.vk-gate-frame[data-state='${name}'] .vk-gate-card`)
            ?.getBoundingClientRect();
          const heading = document.querySelector("#gate-heading")?.getBoundingClientRect();
          return {
            state: name as string,
            above: (heading?.top ?? 0) - (header as number),
            below: innerHeight - (card?.bottom ?? 0),
            card: card?.height ?? 0,
          };
        },
        [state, HEADER] as const,
      ),
    );
  }
  return frees;
}

async function staticCardHeights(page: Page): Promise<number[]> {
  return page
    .locator(`${FRAMES} .vk-gate-card`)
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
}

for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [1024, 672],
] as const) {
  test.describe(`gate pinned at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

    test("pins one sticky stage and holds every state complete for the floor", async ({ page }) => {
      await openStaged(page);
      await expect(page.locator(`${SECTION} .vk-gate-pin`)).toHaveCSS("position", "sticky");
      const samples = await scan(page);
      const required = Math.min(HOLD_FLOOR_PX, (GATE_HOLD_SVH / 100) * height) - SCAN_STEP;
      for (const [index, state] of STATES.entries()) {
        expect(completeDistance(samples, index), state).toBeGreaterThanOrEqual(required);
      }
      if (height === 672) {
        for (const index of STATES.keys())
          expect(completeDistance(samples, index)).toBeGreaterThanOrEqual(HOLD_FLOOR_PX);
      }
    });

    test("never shows two frames at once and lets only the current frame take the pointer", async ({
      page,
    }) => {
      await openStaged(page);
      const samples = await scan(page);
      for (const sample of samples) {
        const sorted = [...sample.opacity].sort((a, b) => b - a);
        expect(sorted[1] ?? 0, `at ${sample.at}`).toBeLessThanOrEqual(0.1);
        sample.opacity.forEach((opacity, index) => {
          if (opacity > 0.1) expect(sample.events[index]).toBe("auto");
        });
      }
      for (const [index, state] of STATES.entries()) {
        const hold = samples.find((s) => s.opacity[index] === 1 && s.done[index]);
        expect(hold, state).toBeDefined();
        hold?.events.forEach((events, other) => {
          if (other !== index) expect(events).toBe("none");
        });
      }
    });

    test("returns the current frame from the middle of its card during every hold", async ({
      page,
    }) => {
      await openStaged(page);
      for (const [index, state] of STATES.entries()) {
        const frame = GATE_SCHEDULE.frames[index];
        await scrollToSvh(page, (frame?.build[1] ?? 0) + GATE_HOLD_SVH / 2);
        const hit = await page.evaluate((name) => {
          const card = document
            .querySelector(`.vk-gate-frame[data-state='${name}'] .vk-gate-card`)
            ?.getBoundingClientRect();
          const node = document.elementFromPoint(
            (card?.left ?? 0) + (card?.width ?? 0) / 2,
            (card?.top ?? 0) + (card?.height ?? 0) / 2,
          );
          return node?.closest(".vk-gate-frame")?.getAttribute("data-state") ?? null;
        }, state);
        expect(hit, state).toBe(state);
      }
    });

    test("keeps the heading in view while the stage is pinned and shifts no layout", async ({
      page,
    }) => {
      await installShiftCounter(page);
      await openStaged(page);
      const samples = await scan(page);
      for (const sample of samples) {
        expect(sample.headingTop, `at ${sample.at}`).toBeGreaterThanOrEqual(HEADER);
        expect(sample.headingBottom, `at ${sample.at}`).toBeLessThanOrEqual(height);
      }
      expect(await layoutShift(page)).toBe(0);
    });

    test("shows the chip of the first frame before the pin and drops it first", async ({
      page,
    }) => {
      await openStaged(page);
      const start = await pinStart(page);
      await page.evaluate((y) => window.scrollTo(0, y - 200), start);
      const before = await page
        .locator(`${FRAMES}[data-state='candidate'] .vk-gate-slot`)
        .evaluate((node) => ({
          opacity: Number(getComputedStyle(node).opacity),
          transform: getComputedStyle(node).transform,
        }));
      expect(before.opacity).toBe(1);
      expect(before.transform).not.toBe("none");
      await scrollToSvh(page, GATE_FADE_SVH + 8);
      await expect(page.locator(`${FRAMES}[data-state='candidate'] .vk-gate-slot`)).toHaveCSS(
        "transform",
        /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/,
      );
    });

    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme on every state`, async ({ page }) => {
        await openInTheme(page, homeUrl("en"), theme);
        await page.evaluate(() => document.fonts.ready);
        for (const [index, frame] of GATE_SCHEDULE.frames.entries()) {
          await scrollToSvh(page, (frame.build[1] ?? 0) + GATE_HOLD_SVH / 2);
          await expect(page.locator(FRAMES).nth(index)).toHaveCSS("opacity", "1");
          await expectNoAxeViolations(page, SECTION);
        }
      });
    }
  });
}

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
] as const) {
  test.describe(`gate free space at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

    test("centres the heading and the current card: free space above and below within 24px", async ({
      page,
    }) => {
      await openStaged(page);
      for (const free of await freeSpace(page)) {
        expect(Math.abs(free.above - free.below), free.state).toBeLessThanOrEqual(
          FREE_SPACE_TOLERANCE,
        );
      }
    });
  });
}

test.describe("gate card heights", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("stay within 60px of each other, and the pinned end state equals the static height", async ({
    page,
    browser,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStaged(page);
    const stacked = await staticCardHeights(page);
    expect(Math.max(...stacked) - Math.min(...stacked)).toBeLessThanOrEqual(CARD_SPREAD_LIMIT);

    const motion = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
    });
    const staged = await motion.newPage();
    await openStaged(staged);
    const pinned = (await freeSpace(staged)).map((free) => free.card);
    await motion.close();
    for (const [index, card] of pinned.entries()) expect(card).toBeCloseTo(stacked[index] ?? 0, 0);
  });
});

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
        for (const [index, frame] of GATE_SCHEDULE.frames.entries()) {
          await scrollToSvh(page, (frame.build[1] ?? 0) + GATE_HOLD_SVH / 2);
          const fit = await page.evaluate(
            ([position, header]) => {
              const current = document.querySelectorAll(".vk-gate-frame")[position as number];
              const card = current?.querySelector(".vk-gate-card")?.getBoundingClientRect();
              return {
                headingTop:
                  document.querySelector("#gate-heading")?.getBoundingClientRect().top ?? 0,
                cardBottom: card?.bottom ?? Number.POSITIVE_INFINITY,
                header: header as number,
                viewport: innerHeight,
              };
            },
            [index, HEADER] as const,
          );
          expect(fit.headingTop, `heading at ${index}`).toBeGreaterThanOrEqual(fit.header);
          expect(fit.cardBottom, `card at ${index}`).toBeLessThanOrEqual(fit.viewport);
        }
      });
    });
  }
}

test.describe("gate with the scroll timeline out of reach", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  test("stacks the frames, reveals the one moving element of each once and shifts no layout", async ({
    page,
  }) => {
    await page.route("**/*.css", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /@supports\s*\(\s*animation-timeline\s*:\s*view\(\)\s*\)/g,
        "@supports (animation-timeline: nothing-like-view())",
      );
      await route.fulfill({ response, body });
    });
    await installShiftCounter(page);
    await openStaged(page);
    await expect(page.locator(`${SECTION} .vk-gate-pin`)).not.toHaveCSS("position", "sticky");
    for (const frame of await page.locator(FRAMES).all()) await expect(frame).toBeVisible();
    for (const moves of await page.locator(MOVES).all()) {
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
      await expect(frame).toHaveCSS("pointer-events", "auto");
    }
    const track = await page.locator(`${SECTION} .vk-gate-track`).boundingBox();
    expect(track?.height ?? 0).toBeLessThan(1800);
  });
});

test.describe("gate with reduced motion", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

  test("shows the three end states stacked, one state per value, as a caption and card row each", async ({
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
    for (const moves of await page.locator(MOVES).all()) {
      await expect(moves).toHaveCSS("opacity", "1");
      await expect(moves).toHaveCSS("transform", "none");
    }
    const text = (await page.locator(SECTION).textContent()) ?? "";
    expect(text.split("Willkommen zurück!")).toHaveLength(2);
    expect(text.split("Willkommen, {name}!")).toHaveLength(3);
    await expect(page.locator(`${SECTION} .vk-gate-pin`)).not.toHaveCSS("position", "sticky");

    for (const frame of frames) {
      const caption = await frame.locator("figcaption").boundingBox();
      const card = await frame.locator(".vk-gate-card").boundingBox();
      expect(caption?.x).toBeLessThan((card?.x ?? 0) - 100);
      expect(card?.width).toBeGreaterThan(700);
      expect(Math.abs((caption?.y ?? 0) - (card?.y ?? 0))).toBeLessThanOrEqual(24);
    }

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

  test("spans the column grid: the card is the eight columns that follow the four of the caption", async ({
    page,
  }) => {
    await openStaged(page);
    const frame = page.locator(FRAMES).first();
    const frameBox = await frame.boundingBox();
    const card = await frame.locator(".vk-gate-card").boundingBox();
    const caption = await frame.locator("figcaption").boundingBox();
    const gap = 24;
    const column = ((frameBox?.width ?? 0) - 11 * gap) / 12;
    expect(caption?.x).toBeCloseTo(frameBox?.x ?? 0, 0);
    expect(card?.x).toBeCloseTo((frameBox?.x ?? 0) + 4 * (column + gap), 0);
    expect((card?.x ?? 0) + (card?.width ?? 0)).toBeCloseTo(
      (frameBox?.x ?? 0) + (frameBox?.width ?? 0),
      0,
    );
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

  test("marks the position of each frame with one lit segment and no number", async ({ page }) => {
    await page.goto("/");
    for (const [index, frame] of (await page.locator(FRAMES).all()).entries()) {
      const marker = frame.locator(".vk-gate-marker");
      await expect(marker).toHaveAttribute("aria-hidden", "true");
      expect(await marker.locator("i[data-on]").count()).toBe(1);
      const lit = await marker
        .locator("i")
        .evaluateAll((nodes) => nodes.map((node) => node.hasAttribute("data-on")));
      expect(lit.indexOf(true)).toBe(index);
      expect(((await marker.textContent()) ?? "").trim()).toBe("");
    }
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

  for (const locale of LOCALES) {
    for (const motion of ["no-preference", "reduce"] as const) {
      const ceiling = locale === "en" ? 1300 : 1350;
      test(`stays at most ${ceiling}px tall in ${locale} with motion ${motion}`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: motion });
        await page.goto(homeUrl(locale));
        const height = await page
          .locator(SECTION)
          .evaluate((node) => node.getBoundingClientRect().height);
        expect(height).toBeLessThanOrEqual(ceiling);
      });
    }
  }

  test("reveals each frame's moving element once, within 600ms and 16px, from hidden to shown", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installShiftCounter(page);
    await openStaged(page);
    const moves = page.locator(MOVES);
    expect(await moves.count()).toBe(3);
    const hidden = await moves.evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return {
          revealed: node.hasAttribute("data-revealed"),
          opacity: Number(style.opacity),
          offset: Number.parseFloat(style.translate.split(" ")[1] ?? "0"),
        };
      }),
    );
    for (const state of hidden) {
      expect(state.revealed).toBe(false);
      expect(state.opacity).toBe(0);
      expect(state.offset).toBeGreaterThan(0);
      expect(state.offset).toBeLessThanOrEqual(16);
    }
    for (const node of await moves.all()) {
      await node.scrollIntoViewIfNeeded();
      await expect(node).toHaveAttribute("data-revealed", "");
      await expect(node).toHaveCSS("opacity", "1");
      const timing = await node.evaluate((element) => {
        const style = getComputedStyle(element);
        return { duration: style.transitionDuration, delay: style.transitionDelay };
      });
      expect(Number.parseFloat(timing.duration.split(",")[0] ?? "0")).toBeGreaterThan(0);
      expect(Number.parseFloat(timing.duration.split(",")[0] ?? "0")).toBeLessThanOrEqual(0.6);
      expect(Number.parseFloat(timing.delay.split(",")[0] ?? "0")).toBeLessThanOrEqual(0.35);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const state of await moves.evaluateAll((nodes) =>
      nodes.map((node) => node.hasAttribute("data-revealed")),
    ))
      expect(state).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await layoutShift(page)).toBe(0);
  });
});

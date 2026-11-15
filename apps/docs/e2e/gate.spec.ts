import { expect, type Page, test } from "playwright/test";
import {
  GATE_CUTS,
  GATE_MARKER_MIN_PX,
  GATE_PAGE_STEP_MARGIN_SVH,
  GATE_PAGE_STEP_MAX_SVH,
  GATE_PIN_SVH,
  gateMarkerRange,
  gateStateAt,
  gateStateMiddle,
  gateStateRange,
} from "@/lib/gate-timeline";
import {
  cross,
  expectPageKeysNeverSkip,
  expectRest,
  expectRestOn,
  expectReversals,
  flipInsideTheEntrance,
  HEADER,
  handoffAcross,
  type Landing,
  MIN_CONTRAST,
  openStaged,
  pinStart,
  restNow,
  reversalSweep,
  STATES,
  scrollInstant,
  scrollToSvh,
  walk,
} from "./gate-support";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  type GateRest,
  homeUrl,
  installGateProbe,
  installShiftCounter,
  LOCALES,
  layoutShift,
  openInTheme,
  THEMES,
} from "./support";

const SECTION = "section#gate";
const FRAMES = `${SECTION} .vk-gate-frame`;
const MOVES = `${FRAMES} .vk-gate-moves`;
const SCAN_STEP = 4;
const REVERSAL_DELAYS = [
  ...Array.from({ length: 21 }, (_, step) => 100 + step * 25),
  ...Array.from({ length: 13 }, (_, step) => 245 + step * 5),
];
const REVERSAL_VIEWPORTS: ReadonlyArray<number> = [900, 672];
const FREE_SPACE_TOLERANCE = 24;
const CARD_SPREAD_LIMIT = 60;
const ENTRANCE_REVERSALS = [
  [330, 330, 330],
  [300, 150, 400, 200],
  [120, 450, 250],
] as const;
const VIEWPORTS = [
  [1440, 900],
  [1280, 720],
  [1024, 672],
] as const;

type Sweep = {
  at: number;
  state: number;
  rest: GateRest;
  headingTop: number;
  headingBottom: number;
  overflow: number;
  scrollX: number;
  fill: number[];
};

async function sweep(page: Page, step: number, reverse: boolean): Promise<Sweep[]> {
  return page.evaluate(
    async ([header, stride, pin, backwards]) => {
      const track = document.querySelector(".vk-gate-track");
      const heading = document.querySelector("#gate-heading");
      if (!track || !heading || !window.gateProbe) throw new Error("no gate");
      const start = track.getBoundingClientRect().top + window.scrollY - header;
      const range = (pin / 100) * innerHeight;
      const segments = [...document.querySelectorAll(".vk-gate-progress i")];
      const offsets: number[] = [];
      for (let y = 0; y <= range; y += stride) offsets.push(y);
      if (backwards) offsets.reverse();
      const samples: Sweep[] = [];
      for (const offset of offsets) {
        window.scrollTo(0, start + offset);
        await window.gateProbe.settle();
        const box = heading.getBoundingClientRect();
        const rest = window.gateProbe.rest();
        samples.push({
          at: offset,
          state: rest.current,
          rest,
          headingTop: box.top,
          headingBottom: box.bottom,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          scrollX: window.scrollX,
          fill: segments.map((segment) => {
            const transform = getComputedStyle(segment, "::after").transform;
            return transform === "none"
              ? 1
              : Number(transform.split(",")[0]?.replace(/[^\d.-]/g, ""));
          }),
        });
      }
      return samples;
    },
    [HEADER, step, GATE_PIN_SVH, reverse] as const,
  );
}

type Free = { state: string; above: number; below: number; card: number };

async function freeSpace(page: Page): Promise<Free[]> {
  const frees: Free[] = [];
  for (const [index, state] of STATES.entries()) {
    await scrollToSvh(page, gateStateMiddle(index));
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

for (const [width, height] of VIEWPORTS) {
  test.describe(`gate pinned at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

    test("rests on exactly one whole frame at every 4px of the pin, forward and back, with full contrast and nothing past an edge, and keeps every state wider than a page step", async ({
      page,
    }) => {
      test.setTimeout(480_000);
      await openStaged(page);
      await expect(page.locator(`${SECTION} .vk-gate-pin`)).toHaveCSS("position", "sticky");
      for (const reverse of [false, true]) {
        const label = `${width}x${height} ${reverse ? "up" : "down"}`;
        expectSweepRests(await sweep(page, SCAN_STEP, reverse), label, height);
      }
    });

    test("keeps the heading in view while the stage is pinned, never overflows sideways and shifts no layout", async ({
      page,
    }) => {
      await installShiftCounter(page);
      await openStaged(page);
      const samples = await sweep(page, 12, false);
      for (const sample of samples) {
        expect(sample.headingTop, `at ${sample.at}`).toBeGreaterThanOrEqual(HEADER);
        expect(sample.headingBottom, `at ${sample.at}`).toBeLessThanOrEqual(height);
        expect(sample.overflow, `overflow at ${sample.at}`).toBeLessThanOrEqual(0);
        expect(sample.scrollX, `scrollX at ${sample.at}`).toBe(0);
      }
      expect(await layoutShift(page)).toBe(0);
    });

    test("returns the current frame from the middle of its card at every rest", async ({
      page,
    }) => {
      await openStaged(page);
      for (const [index, state] of STATES.entries()) {
        await scrollToSvh(page, gateStateMiddle(index));
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

    test("fills each progress segment across its whole state, back to back", async ({ page }) => {
      await openStaged(page);
      const samples = await sweep(page, SCAN_STEP * 2, false);
      const px = (svh: number) => (svh / 100) * height;
      for (const index of STATES.keys()) {
        const [from, to] = gateMarkerRange(index);
        const during = samples.filter(
          (sample) => sample.at > px(from + 0.5) && sample.at < px(to - 0.5),
        );
        const values = during.map((sample) => sample.fill[index] ?? 1);
        expect(Math.min(...values), `fill ${index} starts empty`).toBeLessThan(0.2);
        expect(Math.max(...values), `fill ${index} ends full`).toBeGreaterThan(0.8);
        expect(
          values.every((value, at) => at === 0 || value >= (values[at - 1] ?? 0) - 0.001),
        ).toBe(true);
        const mid = samples.find((sample) => sample.at >= px(gateStateMiddle(index)));
        mid?.fill.forEach((fill, segment) => {
          if (segment < index) expect(fill, `segment ${segment} before ${index}`).toBe(1);
          if (segment > index) expect(fill, `segment ${segment} after ${index}`).toBe(0);
        });
      }
      const widths = await page
        .locator(`${SECTION} .vk-gate-progress i`)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
      expect(widths).toHaveLength(STATES.length);
      for (const segment of widths) expect(segment).toBeGreaterThanOrEqual(GATE_MARKER_MIN_PX);
    });

    test("slides the frames on time, left out and right in going down and the mirror going up, readable for most of the travel, with no two frames above 0.3 and inside the ceiling", async ({
      page,
    }) => {
      await openStaged(page);
      for (const [index, cut] of GATE_CUTS.entries())
        for (const direction of ["down", "up"] as const) {
          const down = direction === "down";
          await handoffAcross(
            page,
            { from: down ? index : index + 1, to: down ? index + 1 : index },
            `${width}x${height} ${cut}svh ${direction}`,
          );
        }
    });

    test("turns back inside the entrance without two frames above 0.3 and settles on one whole frame, and survives a flick through every state", async ({
      page,
    }) => {
      await openStaged(page);
      const start = await pinStart(page);
      const at = (svh: number) => start + (svh / 100) * height;
      for (const waits of ENTRANCE_REVERSALS)
        await flipInsideTheEntrance(page, `${width}x${height}`, [...waits]);
      await scrollToSvh(page, gateStateMiddle(0));
      await page.evaluate((y) => window.scrollTo(0, y), at(gateStateMiddle(2)));
      await expectRestOn(page, "after a flick down", 2);
      await page.evaluate((y) => window.scrollTo(0, y), at(gateStateMiddle(0)));
      await expectRestOn(page, "after a flick up", 0);
      await cross(page, [gateStateMiddle(2)]);
      await expectRestOn(page, "after a sampled flick", 2);
    });

    test("never shows two frames above 0.3 for a reversal at any delay, 100 to 600ms, across both cuts and both directions", async ({
      page,
    }) => {
      test.skip(!REVERSAL_VIEWPORTS.includes(height), "swept at 1440x900 and 1024x672");
      test.setTimeout(480_000);
      await openStaged(page);
      expectReversals(await reversalSweep(page, REVERSAL_DELAYS), `${width}x${height}`);
    });

    test("lands /#gate on the start of the pin, with the heading and the card in view", async ({
      page,
    }) => {
      await page.addInitScript(installGateProbe);
      await page.goto(`${homeUrl("en")}#gate`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const start = await pinStart(page);
      await expect
        .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - start))
        .toBeLessThanOrEqual(2);
      const view = await page.evaluate(() => {
        const heading = document.querySelector("#gate-heading")?.getBoundingClientRect();
        const card = document
          .querySelector(".vk-gate-frame .vk-gate-card")
          ?.getBoundingClientRect();
        return {
          headingTop: heading?.top ?? 0,
          cardBottom: card?.bottom ?? 0,
          above: (heading?.top ?? 0) - 56,
        };
      });
      expect(view.headingTop).toBeGreaterThanOrEqual(56);
      expect(view.cardBottom).toBeLessThanOrEqual(height);
      expect(view.above).toBeLessThanOrEqual(height / 3);
      expectRest(await restNow(page), "/#gate");
    });

    test("keeps the chip of the first frame in place while its frame is current and before the pin, and parks it raised while another frame is", async ({
      page,
    }) => {
      await openStaged(page);
      const chip = page.locator(`${FRAMES}[data-state='candidate'] .vk-gate-slot`);
      const inPlace = /^(none|0px)( 0px)?$/;
      await expect(chip).toHaveCSS("opacity", "1");
      await expect(chip).toHaveCSS("translate", inPlace);
      await scrollToSvh(page, gateStateMiddle(1));
      await expect(chip).toHaveCSS("opacity", "0");
      await expect(chip).toHaveCSS("translate", "0px -12px");
      await scrollToSvh(page, gateStateMiddle(0));
      await expect(chip).toHaveCSS("opacity", "1");
      await expect(chip).toHaveCSS("translate", inPlace);
    });

    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme on every state`, async ({ page }) => {
        await page.addInitScript(installGateProbe);
        await openInTheme(page, homeUrl("en"), theme);
        await page.evaluate(() => document.fonts.ready);
        for (const index of STATES.keys()) {
          await scrollToSvh(page, gateStateMiddle(index));
          await expect(page.locator(FRAMES).nth(index)).toHaveCSS("opacity", "1");
          await expectNoAxeViolations(page, SECTION);
        }
      });
    }
  });
}

function expectSweepRests(samples: Sweep[], label: string, height: number): void {
  const incomplete = samples.filter((sample) => {
    const { rest } = sample;
    return (
      rest.full !== 1 ||
      rest.problems.length > 0 ||
      rest.minContrast < MIN_CONTRAST ||
      rest.pastEdge > 0
    );
  });
  console.log(
    `rests ${label}: ${samples.length} positions, not at one whole frame ${incomplete.length}, lowest contrast ${Math.min(...samples.map((sample) => sample.rest.minContrast)).toFixed(1)}`,
  );
  expect(
    incomplete.map(
      (sample) =>
        `${sample.at}: ${sample.rest.problems.join(",")} contrast ${sample.rest.minContrast.toFixed(1)} edge ${sample.rest.pastEdge}`,
    ),
  ).toEqual([]);
  const cutsPx = GATE_CUTS.map((cut) => (cut / 100) * height);
  for (const sample of samples) {
    if (cutsPx.some((px) => Math.abs(sample.at - px) <= 2 * SCAN_STEP)) continue;
    expect(sample.state, `state at ${sample.at}`).toBe(
      gateStateAt(((sample.at + SCAN_STEP / 2) / height) * 100),
    );
  }
  for (const [index, state] of STATES.entries()) {
    const held = samples.filter((sample) => sample.state === index).length * SCAN_STEP;
    const [from, to] = gateStateRange(index);
    console.log(`hold ${label} ${state}: ${held}px`);
    expect(held, state).toBeGreaterThanOrEqual(
      ((GATE_PAGE_STEP_MAX_SVH + GATE_PAGE_STEP_MARGIN_SVH) / 100) * height - SCAN_STEP,
    );
    expect(held, state).toBeGreaterThanOrEqual(((to - from) / 100) * height - 3 * SCAN_STEP);
  }
}

for (const locale of LOCALES) {
  for (const [width, height] of VIEWPORTS) {
    test.describe(`gate rests ${homeUrl(locale)} at ${width}x${height}`, () => {
      test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

      test("rests on one whole frame at every PageDown, PageUp and wheel-notch landing", async ({
        page,
        browserName,
      }) => {
        test.setTimeout(600_000);
        await openStaged(page, locale);
        const landing: Landing = {
          page,
          start: await pinStart(page),
          height,
          label: `${browserName} ${locale} ${width}x${height}`,
          states: new Set(),
        };
        const end = GATE_PIN_SVH;
        await scrollInstant(page, 0);
        const down = await walk(
          landing,
          "pagedown",
          () => page.keyboard.press("PageDown"),
          (svh) => svh >= end,
        );
        console.log(`pagedown ${landing.label} rests on states ${down.join(",")}`);
        await scrollInstant(page, 1e6);
        const up = await walk(
          landing,
          "pageup",
          () => page.keyboard.press("PageUp"),
          (svh) => svh <= 0,
        );
        console.log(`pageup ${landing.label} rests on states ${up.join(",")}`);
        await expectPageKeysNeverSkip(landing);
        await scrollInstant(page, 0);
        await page.mouse.move(width / 2, height / 2);
        const wheel = await walk(
          landing,
          "wheel",
          () => page.mouse.wheel(0, 100),
          (svh) => svh >= end,
        );
        expect(wheel, "wheel notches rest on every state").toEqual([0, 1, 2]);
        const back = await walk(
          landing,
          "wheel-up",
          () => page.mouse.wheel(0, -100),
          (svh) => svh <= 0,
        );
        expect(back, "wheel-up notches rest on every state").toEqual([0, 1, 2]);
      });
    });
  }
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

test.describe("gate edges at 1920x1080", () => {
  test.use({ viewport: { width: 1920, height: 1080 }, reducedMotion: "no-preference" });

  test("rests with nothing past an edge and never scrolls the document sideways", async ({
    page,
  }) => {
    await openStaged(page);
    for (const sample of await sweep(page, 24, false)) {
      expectRest(sample.rest, `at ${sample.at}`);
      expect(sample.overflow, `overflow at ${sample.at}`).toBeLessThanOrEqual(0);
    }
  });
});

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
        for (const index of STATES.keys()) {
          await scrollToSvh(page, gateStateMiddle(index));
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

  test("shows the three end states stacked, each value once but the old German value in the two frames that show the file, as a caption and card row each", async ({
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

  test("shows no progress marker, which only the pinned stage draws", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(`${SECTION} .vk-gate-progress`)).toBeHidden();
    await expect(page.locator(`${SECTION} .vk-gate-progress`)).toHaveAttribute(
      "aria-hidden",
      "true",
    );
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
      const ceiling = locale === "en" ? 1300 : 1375;
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
    await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "");
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

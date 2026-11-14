import { expect, type Page, test } from "playwright/test";
import {
  GATE_CUTS,
  GATE_HANDOFF_CEILING_MS,
  GATE_MARKER_MIN_PX,
  GATE_OVERLAP_CEILING,
  GATE_PIN_SVH,
  GATE_STATE_FLOOR_SVH,
  gateMarkerRange,
  gateStateAt,
  gateStateMiddle,
} from "@/lib/gate-timeline";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  type GateHandoff,
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
const HEADER = 56;
const STATES = ["candidate", "refused", "stale"] as const;
const SCAN_STEP = 4;
const MIN_CONTRAST = 4.5;
const SAMPLE_MS = 50;
const SAMPLE_WINDOW_MS = 1000;
const SLIDE_SEEN_PX = 20;
const FREE_SPACE_TOLERANCE = 24;
const CARD_SPREAD_LIMIT = 60;
const VIEWPORTS = [
  [1440, 900],
  [1280, 720],
  [1024, 672],
] as const;

async function openStaged(page: Page, locale: (typeof LOCALES)[number] = "en"): Promise<void> {
  await page.addInitScript(installGateProbe);
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

async function settled(page: Page): Promise<void> {
  expect(await page.evaluate(() => window.gateProbe?.settle()), "transitions settle").toBe(true);
}

async function scrollToSvh(page: Page, svh: number): Promise<void> {
  const start = await pinStart(page);
  await page.evaluate(
    (y) => window.scrollTo(0, y),
    start + (svh / 100) * (page.viewportSize()?.height ?? 0),
  );
  await settled(page);
}

async function restNow(page: Page): Promise<GateRest> {
  await settled(page);
  return page.evaluate(() => window.gateProbe?.rest() as GateRest);
}

function expectRest(rest: GateRest, label: string): void {
  expect(rest.problems, `${label}: ${rest.problems.join(" | ")}`).toEqual([]);
  expect(rest.full, `${label}: frames at opacity 1`).toBe(1);
  expect(rest.minContrast, `${label}: lowest text contrast`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(rest.pastEdge, `${label}: elements past a viewport edge`).toBe(0);
}

async function handoffAcross(
  page: Page,
  states: { from: number; to: number },
  label: string,
  moving: boolean,
): Promise<void> {
  await scrollToSvh(page, gateStateMiddle(states.from));
  const samples = await cross(page, gateStateMiddle(states.to));
  const direction = states.to > states.from ? "down" : "up";
  expectHandoff(samples, label, direction, { outgoing: states.from, incoming: states.to }, moving);
}

async function expectRestOn(page: Page, label: string, state: number): Promise<void> {
  const rest = await restNow(page);
  expectRest(rest, label);
  expect(rest.current, `${label}: state`).toBe(state);
}

async function flipAcross(page: Page, first: number, second: number): Promise<number> {
  return page.evaluate(
    async ([from, to]) => {
      const read = () =>
        [...document.querySelectorAll(".vk-gate-frame")].map((node) =>
          Number(getComputedStyle(node).opacity),
        );
      let peak = 0;
      for (let flip = 0; flip < 8; flip += 1) {
        window.scrollTo(0, flip % 2 === 0 ? (to as number) : (from as number));
        for (let wait = 0; wait < 6; wait += 1) {
          await new Promise((resolve) => setTimeout(resolve, 16));
          const [top = 0, next = 0] = read().sort((x, y) => y - x);
          peak = Math.max(peak, Math.min(top, next));
        }
      }
      return peak;
    },
    [first, second] as const,
  );
}

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

async function cross(page: Page, svh: number): Promise<GateHandoff[]> {
  const start = await pinStart(page);
  const height = page.viewportSize()?.height ?? 0;
  return page.evaluate(
    ([y, step, length]) =>
      window.gateProbe?.handoff(step as number, length as number, () =>
        window.scrollTo(0, y as number),
      ) ?? [],
    [start + (svh / 100) * height, SAMPLE_MS, SAMPLE_WINDOW_MS] as const,
  );
}

function joint(samples: GateHandoff[]): number {
  return Math.max(
    ...samples.map((sample) => {
      const [first = 0, second = 0] = [...sample.frames].sort((a, b) => b - a);
      return Math.min(first, second);
    }),
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

    test("rests on exactly one whole frame at every 4px of the pin, forward and back, and gives every state its floor", async ({
      page,
      browserName,
    }) => {
      test.setTimeout(240_000);
      await openStaged(page);
      await expect(page.locator(`${SECTION} .vk-gate-pin`)).toHaveCSS("position", "sticky");
      for (const reverse of [false, true]) {
        const label = `${browserName} ${width}x${height} ${reverse ? "up" : "down"}`;
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

    test("slides the frames on time, left out and right in going down and the mirror going up, with no two frames above 0.3 and inside the ceiling", async ({
      page,
      browserName,
    }) => {
      await openStaged(page);
      for (const [index, cut] of GATE_CUTS.entries())
        for (const direction of ["down", "up"] as const)
          await handoffAcross(
            page,
            {
              from: direction === "down" ? index : index + 1,
              to: direction === "down" ? index + 1 : index,
            },
            `${browserName} ${width}x${height} ${cut}svh ${direction}`,
            browserName !== "firefox",
          );
    });

    test("survives a fast back and forth across a cut and a flick through every state, ending on one whole frame", async ({
      page,
      browserName,
    }) => {
      await openStaged(page);
      const start = await pinStart(page);
      const at = (svh: number) => start + (svh / 100) * height;
      await scrollToSvh(page, gateStateMiddle(0));
      const peaks = await flipAcross(page, at(gateStateMiddle(0)), at(gateStateMiddle(1)));
      console.log(`back and forth ${browserName} ${width}x${height}: joint ${peaks.toFixed(2)}`);
      expect(peaks).toBeLessThanOrEqual(GATE_OVERLAP_CEILING);
      await expectRestOn(page, "after back and forth", 0);
      await page.evaluate((y) => window.scrollTo(0, y), at(gateStateMiddle(2)));
      await expectRestOn(page, "after a flick down", 2);
      await page.evaluate((y) => window.scrollTo(0, y), at(gateStateMiddle(0)));
      await expectRestOn(page, "after a flick up", 0);
    });

    test("lands /#gate on the start of the pin, with the heading and the card in view", async ({
      page,
    }) => {
      await page.addInitScript(installGateProbe);
      await page.goto(`${homeUrl("en")}#gate`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const start = await pinStart(page);
      const scrolled = await page.evaluate(() => window.scrollY);
      expect(Math.abs(scrolled - start)).toBeLessThanOrEqual(2);
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

    test("shows the chip of the first frame dropped before the pin and in place once its frame is current", async ({
      page,
    }) => {
      await openStaged(page);
      const chip = page.locator(`${FRAMES}[data-state='candidate'] .vk-gate-slot`);
      await scrollToSvh(page, gateStateMiddle(0));
      await expect(chip).toHaveCSS("opacity", "1");
      await expect(chip).toHaveCSS("translate", /^(none|0px)( 0px)?$/);
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
  const incomplete = samples.filter(
    (sample) => sample.rest.full !== 1 || sample.rest.problems.length > 0,
  );
  console.log(
    `rests ${label}: ${samples.length} positions, not at one full frame ${incomplete.length}`,
  );
  expect(incomplete.map((sample) => `${sample.at}: ${sample.rest.problems.join(",")}`)).toEqual([]);
  const cutsPx = GATE_CUTS.map((cut) => (cut / 100) * height);
  for (const sample of samples) {
    if (cutsPx.some((px) => Math.abs(sample.at - px) <= 2 * SCAN_STEP)) continue;
    expect(sample.state, `state at ${sample.at}`).toBe(
      gateStateAt(((sample.at + SCAN_STEP / 2) / height) * 100),
    );
  }
  for (const [index, state] of STATES.entries()) {
    const held = samples.filter((sample) => sample.state === index).length * SCAN_STEP;
    console.log(`hold ${label} ${state}: ${held}px`);
    expect(held, state).toBeGreaterThanOrEqual((GATE_STATE_FLOOR_SVH / 100) * height - SCAN_STEP);
  }
}

function expectHandoff(
  samples: GateHandoff[],
  label: string,
  direction: "down" | "up",
  frames: { outgoing: number; incoming: number },
  moving: boolean,
): void {
  const { outgoing, incoming } = frames;
  const peak = joint(samples);
  console.log(`handoff ${label}: joint ${peak.toFixed(2)}`);
  expect(peak, label).toBeLessThanOrEqual(GATE_OVERLAP_CEILING);
  const done = samples.find((sample) => sample.at > 0 && sample.frames[incoming] === 1);
  expect(done?.at ?? Number.POSITIVE_INFINITY, `${label} settles`).toBeLessThanOrEqual(
    GATE_HANDOFF_CEILING_MS + SAMPLE_MS * 2,
  );
  expect(samples.at(-1)?.frames[incoming], label).toBe(1);
  expect(samples.at(-1)?.frames[outgoing], label).toBe(0);
  if (!moving) return;
  const fading = samples.some((sample) => {
    const opacity = sample.frames[outgoing] ?? 0;
    return opacity > 0.02 && opacity < 0.98;
  });
  expect(fading, `${label} runs on time`).toBe(true);
  const side = direction === "down" ? -1 : 1;
  const leave = samples.map((sample) => (sample.captions[outgoing] ?? 0) * side);
  const enter = samples.map((sample) => (sample.captions[incoming] ?? 0) * -side);
  expect(Math.max(...leave), `${label} leaves`).toBeGreaterThan(SLIDE_SEEN_PX / 4);
  expect(Math.min(...leave), `${label} leaves the right way`).toBeGreaterThanOrEqual(-0.5);
  expect(Math.max(...enter), `${label} arrives from the other side`).toBeGreaterThan(SLIDE_SEEN_PX);
  expect(Math.min(...enter), `${label} arrives the right way`).toBeGreaterThanOrEqual(-0.5);
}

type Landing = { page: Page; start: number; height: number; label: string; states: Set<number> };

async function currentSvh(landing: Landing): Promise<number> {
  const y = await landing.page.evaluate(() => window.scrollY);
  return ((y - landing.start) / landing.height) * 100;
}

async function land(landing: Landing, kind: string, detail: string): Promise<void> {
  const y = await settleScroll(landing.page);
  const svh = ((y - landing.start) / landing.height) * 100;
  if (svh <= 0 || svh >= GATE_PIN_SVH) return;
  const rest = await restNow(landing.page);
  console.log(
    `${kind} ${landing.label} ${detail} y${y} ${svh.toFixed(1)}svh frame ${rest.current} opacity ${rest.full === 1 ? 1 : "below 1"} contrast ${rest.minContrast.toFixed(1)} past edge ${rest.pastEdge}`,
  );
  expectRest(rest, `${kind} ${detail} at ${svh.toFixed(1)}svh`);
  landing.states.add(rest.current);
}

async function walk(
  landing: Landing,
  kind: string,
  press: () => Promise<void>,
  done: (svh: number) => boolean,
): Promise<number[]> {
  landing.states.clear();
  for (let count = 0; count < 90; count += 1) {
    await press();
    await land(landing, kind, String(count));
    if (done(await currentSvh(landing))) break;
  }
  return [...landing.states].sort();
}

async function settleScroll(page: Page): Promise<number> {
  let last = Number.NaN;
  let stable = 0;
  for (let tries = 0; tries < 80 && stable < 3; tries += 1) {
    await page.waitForTimeout(60);
    const y = await page.evaluate(() => window.scrollY);
    stable = y === last ? stable + 1 : 0;
    last = y;
  }
  return last;
}

for (const locale of LOCALES) {
  for (const [width, height] of VIEWPORTS) {
    test.describe(`gate rests ${homeUrl(locale)} at ${width}x${height}`, () => {
      test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

      test("rests on one whole frame at every PageDown, PageUp and wheel-notch landing", async ({
        page,
        browserName,
      }) => {
        test.setTimeout(420_000);
        await openStaged(page, locale);
        const landing: Landing = {
          page,
          start: await pinStart(page),
          height,
          label: `${browserName} ${locale} ${width}x${height}`,
          states: new Set(),
        };
        const end = GATE_PIN_SVH;
        await page.evaluate(() => window.scrollTo(0, 0));
        await settleScroll(page);
        const down = await walk(
          landing,
          "pagedown",
          () => page.keyboard.press("PageDown"),
          (svh) => svh >= end,
        );
        console.log(`pagedown ${landing.label} rests on states ${down.join(",")}`);
        if (browserName === "chromium")
          expect(down, "PageDown rests on every state").toEqual([0, 1, 2]);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await settleScroll(page);
        const up = await walk(
          landing,
          "pageup",
          () => page.keyboard.press("PageUp"),
          (svh) => svh <= 0,
        );
        console.log(`pageup ${landing.label} rests on states ${up.join(",")}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await settleScroll(page);
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

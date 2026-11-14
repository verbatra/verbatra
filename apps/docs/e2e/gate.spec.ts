import { expect, type Page, test } from "playwright/test";
import {
  GATE_CARD_MIN_PAINT,
  GATE_FRAME_PAINTED,
  GATE_HOLD_FLOOR_SVH,
  GATE_MARKER_MIN_PX,
  GATE_PHASES,
  GATE_PIN_SVH,
  gateHoldMiddle,
} from "@/lib/gate-timeline";
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
const HOLD_FLOOR_PX: Readonly<Record<number, number>> = { 672: 150, 900: 200 };
const SEGMENTS = ["candidate", "refused", "stale"] as const;
const OPAQUE_PAINT = 0.9;
const EDGE_TOLERANCE_PX = 4;
const FREE_SPACE_TOLERANCE = 24;
const CARD_SPREAD_LIMIT = 60;

type Sample = {
  at: number;
  opacity: number[];
  events: string[];
  done: boolean[];
  captionX: number[];
  cardX: number[];
  cardScale: number[];
  fill: number[];
  cards: number[];
  overprint: number;
  overflow: number;
  scrollX: number;
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
    async ([header, step, pin, visibleFloor]) => {
      const track = document.querySelector(".vk-gate-track");
      const heading = document.querySelector("#gate-heading");
      if (!track || !heading) throw new Error("no gate");
      const start = track.getBoundingClientRect().top + window.scrollY - header;
      const range = (pin / 100) * innerHeight;
      const frames = [...document.querySelectorAll(".vk-gate-frame")];
      const parts = frames.map((frame) => ({
        caption: frame.querySelector(":scope > figcaption") as Element,
        card: frame.querySelector(":scope > .vk-gate-card") as Element,
        moving: [
          ...frame.querySelectorAll(".vk-gate-moves, .vk-gate-cli .vk-lock-line"),
        ] as Element[],
      }));
      const segments = [...document.querySelectorAll(".vk-gate-progress i")];
      const matrix = (transform: string): number[] =>
        transform === "none"
          ? [1, 0, 0, 1, 0, 0]
          : transform
              .replace(/^matrix\(|\)$/g, "")
              .split(",")
              .map(Number);
      const painted = (frame: Element, element: Element): number =>
        Number(getComputedStyle(frame).opacity) * Number(getComputedStyle(element).opacity);
      const meets = (a: DOMRect, b: DOMRect): boolean =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      const overprint = (list: Element[], items: typeof parts): number => {
        const shown = items.flatMap((part, index) =>
          [part.caption, part.card].map((element) => ({
            index,
            alpha: painted(list[index] as Element, element),
            box: element.getBoundingClientRect(),
          })),
        );
        const visible = shown.filter((entry) => entry.alpha >= visibleFloor);
        return visible.filter((a) => visible.some((b) => a.index < b.index && meets(a.box, b.box)))
          .length;
      };
      const settled = (element: Element): boolean => {
        const style = getComputedStyle(element);
        return (
          Number(style.opacity) === 1 &&
          (style.transform === "none" || style.transform === "matrix(1, 0, 0, 1, 0, 0)")
        );
      };
      const samples: Sample[] = [];
      for (let y = start; y <= start + range; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const box = heading.getBoundingClientRect();
        samples.push({
          at: y - start,
          opacity: frames.map((frame) => Number(getComputedStyle(frame).opacity)),
          events: frames.map((frame) => getComputedStyle(frame).pointerEvents),
          done: parts.map(
            (part) => settled(part.caption) && settled(part.card) && part.moving.every(settled),
          ),
          captionX: parts.map((part) => matrix(getComputedStyle(part.caption).transform)[4] ?? 0),
          cardX: parts.map((part) => matrix(getComputedStyle(part.card).transform)[4] ?? 0),
          cardScale: parts.map((part) => matrix(getComputedStyle(part.card).transform)[0] ?? 1),
          fill: segments.map(
            (segment) => matrix(getComputedStyle(segment, "::after").transform)[0] ?? 1,
          ),
          cards: frames.map(
            (frame, index) =>
              Number(getComputedStyle(frame).opacity) *
              Number(getComputedStyle(parts[index]?.card as Element).opacity),
          ),
          overprint: overprint(frames, parts),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          scrollX: window.scrollX,
          headingTop: box.top,
          headingBottom: box.bottom,
        });
      }
      return samples;
    },
    [HEADER, SCAN_STEP, GATE_PIN_SVH, GATE_FRAME_PAINTED] as const,
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

type Mover = { name: string; alpha: number; left: number; right: number; clippers: string[] };

async function moversNow(page: Page): Promise<{ width: number; movers: Mover[] }> {
  return page.evaluate(() => {
    const describe = (node: Element): string =>
      `${node.tagName.toLowerCase()}.${[...node.classList].join(".")}`;
    const clipping = (element: Element): string[] => {
      const found: string[] = [];
      let node = element.parentElement;
      while (node && node !== document.documentElement) {
        const style = getComputedStyle(node);
        const clips =
          style.overflowX !== "visible" ||
          style.overflowY !== "visible" ||
          style.clipPath !== "none";
        if (clips) found.push(describe(node));
        node = node.parentElement;
      }
      return found;
    };
    const movers = [...document.querySelectorAll(".vk-gate-frame")].flatMap((frame) =>
      [":scope > figcaption", ":scope > .vk-gate-card"].map((selector) => {
        const element = frame.querySelector(selector) as Element;
        const box = element.getBoundingClientRect();
        return {
          name: describe(element),
          alpha:
            Number(getComputedStyle(frame).opacity) * Number(getComputedStyle(element).opacity),
          left: box.left,
          right: box.right,
          clippers: clipping(element),
        };
      }),
    );
    return { width: document.documentElement.clientWidth, movers };
  });
}

async function edgeReport(
  page: Page,
  height: number,
): Promise<{ clippers: string[]; outside: string[] }> {
  const start = (await pinStart(page)) - 8;
  const clippers = new Set<string>();
  const outside: string[] = [];
  for (let y = start; y <= start + (GATE_PIN_SVH / 100) * height + 16; y += 12) {
    await page.evaluate(async (target) => {
      window.scrollTo(0, target);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, y);
    const now = await moversNow(page);
    for (const mover of now.movers.filter((candidate) => candidate.alpha >= 0.02)) {
      for (const name of mover.clippers) clippers.add(name);
      if (
        mover.alpha >= OPAQUE_PAINT &&
        (mover.left < -EDGE_TOLERANCE_PX || mover.right > now.width + EDGE_TOLERANCE_PX)
      )
        outside.push(`${mover.name} ${mover.left.toFixed(1)}..${mover.right.toFixed(1)}`);
    }
  }
  return { clippers: [...clippers], outside };
}

type Free = { state: string; above: number; below: number; card: number };

async function freeSpace(page: Page): Promise<Free[]> {
  const frees: Free[] = [];
  for (const [index, state] of STATES.entries()) {
    const svh = gateHoldMiddle(index);
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
      const required = (GATE_HOLD_FLOOR_SVH / 100) * height - SCAN_STEP;
      for (const [index, state] of STATES.entries()) {
        const held = completeDistance(samples, index);
        console.log(`hold ${width}x${height} ${state}: ${held}px`);
        expect(held, state).toBeGreaterThanOrEqual(required);
      }
      const floor = HOLD_FLOOR_PX[height];
      if (floor !== undefined) {
        for (const index of STATES.keys())
          expect(
            completeDistance(samples, index) + SCAN_STEP,
            `${STATES[index]}`,
          ).toBeGreaterThanOrEqual(floor);
      }
    });

    test("overprints no text, always paints exactly one frame at the dim floor or more and lets only that frame take the pointer", async ({
      page,
    }) => {
      await openStaged(page);
      const samples = await scan(page);
      let lowest = 1;
      for (const sample of samples) {
        expect(sample.overprint, `overprint at ${sample.at}`).toBe(0);
        const shown = sample.opacity.filter((opacity) => opacity > GATE_FRAME_PAINTED);
        expect(shown.length, `frames at ${sample.at}`).toBe(1);
        lowest = Math.min(lowest, Math.max(...sample.cards));
        sample.opacity.forEach((opacity, index) => {
          expect(sample.events[index], `pointer at ${sample.at}`).toBe(
            opacity > GATE_FRAME_PAINTED ? "auto" : "none",
          );
        });
      }
      console.log(`lowest card ${width}x${height}: ${lowest.toFixed(2)}`);
      expect(lowest).toBeGreaterThanOrEqual(GATE_CARD_MIN_PAINT);
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
        await scrollToSvh(page, gateHoldMiddle(index));
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

    test("slides the incoming frame in from the right and the outgoing one out to the left", async ({
      page,
    }) => {
      await openStaged(page);
      const samples = await scan(page);
      const px = (svh: number) => (svh / 100) * height;
      const within = (range: readonly [number, number]) =>
        samples.filter((sample) => sample.at >= px(range[0]) && sample.at <= px(range[1]));
      const monotone = (values: number[], direction: 1 | -1) =>
        values.every(
          (value, index) => index === 0 || (value - (values[index - 1] ?? 0)) * direction >= -0.5,
        );
      for (const index of [1, 2]) {
        const phases = GATE_PHASES[index];
        for (const [range, key] of [
          [phases?.enterCaption, "captionX"],
          [phases?.enterCard, "cardX"],
        ] as const) {
          const xs = within(range ?? [0, 0]).map((sample) => sample[key][index] ?? 0);
          expect(Math.max(...xs), `${key} ${index} starts right`).toBeGreaterThan(20);
          expect(Math.min(...xs), `${key} ${index} never left of rest`).toBeGreaterThanOrEqual(
            -0.5,
          );
          expect(monotone(xs, -1), `${key} ${index} only moves left`).toBe(true);
        }
        const scales = within(phases?.enterCard ?? [0, 0]).map(
          (sample) => sample.cardScale[index] ?? 1,
        );
        expect(Math.min(...scales)).toBeLessThan(0.99);
        expect(Math.max(...scales)).toBeLessThanOrEqual(1.0001);
      }
      for (const index of [0, 1]) {
        const phases = GATE_PHASES[index];
        for (const [range, key] of [
          [phases?.exitCaption, "captionX"],
          [phases?.exitCard, "cardX"],
        ] as const) {
          const xs = within(range ?? [0, 0]).map((sample) => sample[key][index] ?? 0);
          expect(Math.min(...xs), `${key} ${index} leaves left`).toBeLessThan(-20);
          expect(Math.max(...xs), `${key} ${index} never right of rest`).toBeLessThanOrEqual(0.5);
          expect(monotone(xs, -1), `${key} ${index} only moves left`).toBe(true);
        }
      }
      const captionEnd = GATE_PHASES[1]?.enterCaption?.[1] ?? 0;
      const captionDone = within([captionEnd - 1, captionEnd + 0.2]).map(
        (sample) => sample.captionX[1],
      );
      const cardBusy = within([captionEnd - 1, captionEnd + 0.2]).map((sample) => sample.cardX[1]);
      expect(Math.max(...captionDone.map(Math.abs))).toBeLessThan(0.5);
      expect(Math.max(...cardBusy)).toBeGreaterThan(0.2);
    });

    test("never overflows the document sideways at any scroll position", async ({ page }) => {
      await openStaged(page);
      const samples = await scan(page);
      const worst = Math.max(...samples.map((sample) => sample.overflow));
      console.log(`overflow ${width}x${height}: ${worst}`);
      for (const sample of samples) {
        expect(sample.overflow, `at ${sample.at}`).toBeLessThanOrEqual(0);
        expect(sample.scrollX, `at ${sample.at}`).toBe(0);
      }
      const peak = samples.reduce(
        (best, sample) => Math.max(best, [...sample.opacity].sort((a, b) => b - a)[1] ?? 0),
        0,
      );
      console.log(`second frame peak ${width}x${height}: ${peak}`);
    });

    test("fills each progress segment across its whole state, back to back, and leaves every end state untransformed", async ({
      page,
    }) => {
      await openStaged(page);
      const samples = await scan(page);
      const px = (svh: number) => (svh / 100) * height;
      for (const [index, phases] of GATE_PHASES.entries()) {
        const [from, to] = phases.marker;
        const during = samples.filter(
          (sample) => sample.at > px(from + 0.5) && sample.at < px(to - 0.5),
        );
        const values = during.map((sample) => sample.fill[index] ?? 1);
        expect(Math.min(...values), `fill ${index} starts empty`).toBeLessThan(0.2);
        expect(Math.max(...values), `fill ${index} ends full`).toBeGreaterThan(0.8);
        expect(
          values.every((value, at) => at === 0 || value >= (values[at - 1] ?? 0) - 0.001),
        ).toBe(true);
        const mid = samples.find((sample) => sample.at >= px(gateHoldMiddle(index)));
        mid?.fill.forEach((fill, segment) => {
          if (segment < index) expect(fill, `segment ${segment} before ${index}`).toBe(1);
          if (segment > index) expect(fill, `segment ${segment} after ${index}`).toBe(0);
        });
      }
      const widths = await page
        .locator(`${SECTION} .vk-gate-progress i`)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
      expect(widths).toHaveLength(SEGMENTS.length);
      for (const width of widths) expect(width).toBeGreaterThanOrEqual(GATE_MARKER_MIN_PX);
      await scrollToSvh(page, GATE_PIN_SVH + 12);
      const end = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            ".vk-gate-frame[data-state='stale'], .vk-gate-frame[data-state='stale'] > *, .vk-gate-frame[data-state='stale'] .vk-gate-moves, .vk-gate-frame[data-state='stale'] .vk-gate-cli .vk-lock-line",
          ),
        ].map((node) => [getComputedStyle(node).transform, getComputedStyle(node).opacity]),
      );
      for (const [transform, opacity] of end) {
        expect(transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
        expect(opacity).toBe("1");
      }
    });

    test("keeps opaque movers inside the viewport, lets only the fading tail cross it and clips only at the page", async ({
      page,
    }) => {
      await openStaged(page);
      const report = await edgeReport(page, height);
      console.log(`clippers ${width}x${height}: ${report.clippers.join(" | ")}`);
      expect(report.outside).toEqual([]);
      expect(report.clippers).toEqual(["div.vk-home.w-full"]);
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
      await scrollToSvh(page, 8);
      await expect(page.locator(`${FRAMES}[data-state='candidate'] .vk-gate-slot`)).toHaveCSS(
        "transform",
        /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/,
      );
    });

    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme on every state`, async ({ page }) => {
        await openInTheme(page, homeUrl("en"), theme);
        await page.evaluate(() => document.fonts.ready);
        for (const index of STATES.keys()) {
          await scrollToSvh(page, gateHoldMiddle(index));
          await expect(page.locator(FRAMES).nth(index)).toHaveCSS("opacity", "1");
          await expectNoAxeViolations(page, SECTION);
        }
      });
    }
  });
}

type Paint = { frame: number; caption: number; card: number; lineGaps: number };

async function paints(page: Page): Promise<Paint[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".vk-gate-frame")].map((frame) => {
      const frameOpacity = Number(getComputedStyle(frame).opacity);
      const part = (selector: string) =>
        frameOpacity * Number(getComputedStyle(frame.querySelector(selector) as Element).opacity);
      const lineGaps = [...frame.querySelectorAll(".vk-lock-line")].filter((line) => {
        const style = getComputedStyle(line);
        return style.opacity !== "1" || style.transform !== "none";
      }).length;
      return {
        frame: frameOpacity,
        caption: part(":scope > figcaption"),
        card: part(":scope > .vk-gate-card"),
        lineGaps,
      };
    }),
  );
}

function expectOneFrame(list: Paint[], label: string): void {
  const painted = list.flatMap((paint, index) => (paint.frame > GATE_FRAME_PAINTED ? [index] : []));
  expect(painted.length, `${label}: frames painted ${JSON.stringify(list)}`).toBe(1);
  const [only] = painted;
  expect(list[only ?? 0]?.frame, label).toBeGreaterThanOrEqual(GATE_CARD_MIN_PAINT);
  expect(list[only ?? 0]?.card, `${label}: card`).toBeGreaterThanOrEqual(GATE_CARD_MIN_PAINT);
  expect(list[only ?? 0]?.lineGaps, `${label}: lines missing or lagging their card`).toBe(0);
  list.forEach((paint, index) => {
    if (index === only) return;
    expect(paint.card, `${label}: second card ${index}`).toBeLessThanOrEqual(GATE_FRAME_PAINTED);
    expect(paint.caption, `${label}: second caption ${index}`).toBeLessThanOrEqual(
      GATE_FRAME_PAINTED,
    );
  });
}

async function sweepFrames(
  page: Page,
  step: number,
): Promise<Array<{ at: number; list: Paint[] }>> {
  return page.evaluate(
    async ([header, stride, pin]) => {
      const track = document.querySelector(".vk-gate-track");
      if (!track) throw new Error("no gate");
      const start = track.getBoundingClientRect().top + window.scrollY - (header as number);
      const range = ((pin as number) / 100) * innerHeight;
      const frames = [...document.querySelectorAll(".vk-gate-frame")];
      const out: Array<{ at: number; list: Paint[] }> = [];
      for (let y = start; y <= start + range; y += stride as number) {
        window.scrollTo(0, y);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        out.push({
          at: y - start,
          list: frames.map((frame) => {
            const frameOpacity = Number(getComputedStyle(frame).opacity);
            const part = (selector: string) =>
              frameOpacity *
              Number(getComputedStyle(frame.querySelector(selector) as Element).opacity);
            const lineGaps = [...frame.querySelectorAll(".vk-lock-line")].filter((line) => {
              const style = getComputedStyle(line);
              return style.opacity !== "1" || style.transform !== "none";
            }).length;
            return {
              frame: frameOpacity,
              caption: part(":scope > figcaption"),
              card: part(":scope > .vk-gate-card"),
              lineGaps,
            };
          }),
        });
      }
      return out;
    },
    [HEADER, step, GATE_PIN_SVH] as const,
  );
}

async function settle(page: Page): Promise<number> {
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
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 672],
  ] as const) {
    test.describe(`gate hard cut ${homeUrl(locale)} at ${width}x${height}`, () => {
      test.use({ viewport: { width, height }, reducedMotion: "no-preference" });

      test("paints exactly one frame at every position, PageDown landing and wheel notch", async ({
        page,
        browserName,
      }) => {
        test.setTimeout(300_000);
        await openStaged(page, locale);
        let two = 0;
        let lowest = 1;
        let gaps = 0;
        await test.step("2px sweep", async () => {
          for (const { at, list } of await sweepFrames(page, 2)) {
            const painted = list.filter((paint) => paint.frame > GATE_FRAME_PAINTED);
            if (painted.length !== 1) two += 1;
            if (painted.some((paint) => paint.lineGaps > 0)) gaps += 1;
            expectOneFrame(list, `sweep ${at}px`);
            lowest = Math.min(lowest, ...painted.map((paint) => paint.frame));
            const captionOwner = list.flatMap((paint, i) =>
              paint.caption > GATE_FRAME_PAINTED ? [i] : [],
            );
            const cardOwner = list.flatMap((paint, i) =>
              paint.card > GATE_FRAME_PAINTED ? [i] : [],
            );
            expect(captionOwner, `caption owner at ${at}px`).toEqual(cardOwner);
          }
        });
        console.log(
          `cut ${browserName} ${locale} ${width}x${height}: two frames ${two}, positions with a missing line ${gaps}, lowest frame ${lowest.toFixed(2)}`,
        );
        expect(two).toBe(0);
        expect(gaps).toBe(0);
        await page.evaluate(() => window.scrollTo(0, 0));
        await settle(page);
        const start = await pinStart(page);
        await test.step("PageDown landings", async () => {
          for (let press = 0; press < 40; press += 1) {
            await page.keyboard.press("PageDown");
            const y = await settle(page);
            const svh = ((y - start) / height) * 100;
            if (svh > 0 && svh < GATE_PIN_SVH) {
              const list = await paints(page);
              console.log(
                `pagedown ${browserName} ${locale} ${width}x${height} y${y} ${svh.toFixed(1)}svh frames ${list.map((p) => p.frame.toFixed(2))} cards ${list.map((p) => p.card.toFixed(2))}`,
              );
              expectOneFrame(list, `PageDown ${press} at ${y}`);
            }
            if (svh >= GATE_PIN_SVH) break;
          }
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        await settle(page);
        await page.mouse.move(width / 2, height / 2);
        await test.step("wheel notches", async () => {
          for (let notch = 1; notch <= 80; notch += 1) {
            await page.mouse.wheel(0, 100);
            const y = await settle(page);
            const svh = ((y - start) / height) * 100;
            if (svh > 0 && svh < GATE_PIN_SVH) {
              const list = await paints(page);
              console.log(
                `wheel ${browserName} ${locale} ${width}x${height} notch ${notch} y${y} ${svh.toFixed(1)}svh frames ${list.map((p) => p.frame.toFixed(2))} cards ${list.map((p) => p.card.toFixed(2))}`,
              );
              expectOneFrame(list, `wheel ${notch} at ${y}`);
            }
            if (svh >= GATE_PIN_SVH) break;
          }
        });
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

  test("cuts no mover at an edge and never scrolls the document sideways", async ({ page }) => {
    await openStaged(page);
    const report = await edgeReport(page, 1080);
    expect(report.outside).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
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
          await scrollToSvh(page, gateHoldMiddle(index));
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

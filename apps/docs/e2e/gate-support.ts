import { expect, type Page, test } from "playwright/test";
import type { Locale } from "@/lib/locales";
import {
  GATE_CUTS,
  GATE_HANDOFF_CEILING_MS,
  GATE_LANDING_OFFSET_PX,
  GATE_PIN_SVH,
  GATE_REVERSAL_SAMPLE_TAIL_MS,
  GATE_REVERSAL_SETTLE_MS,
  GATE_SLIDE_SCALE,
  gateStateMiddle,
} from "@/test-support/gate-schedule";
import {
  type GateFlip,
  type GateHandoff,
  type GateRest,
  type GateReversal,
  type GateReversalResult,
  homeUrl,
  installGateProbe,
  type LOCALES,
} from "./support";

export const HEADER = GATE_LANDING_OFFSET_PX;
export const VIEWPORTS = [
  [1440, 900],
  [1280, 720],
  [1024, 672],
] as const;
export const REST_SWEEP_EARLY_LOCALES: readonly Locale[] = ["en", "de", "es"];
const GATE_OVERLAP_CEILING = 0.3;
const GATE_GAP_CEILING_MS = 80;
const GATE_OUT_READABLE_OPACITY = 0.5;
const GATE_OUT_READABLE_TRAVEL = 0.6;
const GATE_IN_READABLE_REMAINING = 0.4;
export const MIN_CONTRAST = 4.5;
export const STATES = ["candidate", "refused", "stale"] as const;

const HANDOFF_WINDOW_MS = 1000;
const SAMPLING_SLACK_MS = 50;
const INTERMEDIATE_PX = 4;
const SCALE_SEEN = 0.005;

export async function openStaged(
  page: Page,
  locale: (typeof LOCALES)[number] = "en",
): Promise<void> {
  await page.addInitScript(installGateProbe);
  await page.goto(homeUrl(locale), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".vk-scroll-top-sentinel")).toBeAttached();
}

export async function pinStart(page: Page): Promise<number> {
  return page.evaluate(
    (header) =>
      (document.querySelector(".vk-gate-track")?.getBoundingClientRect().top ?? 0) +
      window.scrollY -
      header,
    HEADER,
  );
}

export async function settled(page: Page): Promise<void> {
  expect(await page.evaluate(() => window.gateProbe?.settle()), "transitions settle").toBe(true);
}

export async function scrollToSvh(page: Page, svh: number): Promise<void> {
  const start = await pinStart(page);
  await page.evaluate(
    (y) => window.scrollTo(0, y),
    start + (svh / 100) * (page.viewportSize()?.height ?? 0),
  );
  await settled(page);
}

export async function restNow(page: Page): Promise<GateRest> {
  await settled(page);
  return page.evaluate(() => window.gateProbe?.rest() as GateRest);
}

export function expectRest(rest: GateRest, label: string): void {
  expect(rest.problems, `${label}: ${rest.problems.join(" | ")}`).toEqual([]);
  expect(rest.full, `${label}: frames at opacity 1`).toBe(1);
  expect(rest.minContrast, `${label}: lowest text contrast`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(rest.pastEdge, `${label}: elements past a viewport edge`).toBe(0);
}

export async function expectRestOn(page: Page, label: string, state: number): Promise<void> {
  const rest = await restNow(page);
  expectRest(rest, label);
  expect(rest.current, `${label}: state`).toBe(state);
}

export async function scrollTimeline(
  page: Page,
  length: number,
  flips: GateFlip[],
): Promise<GateHandoff[]> {
  return page.evaluate(
    ([window_, list]) => window.gateProbe?.handoff(window_ as number, list as GateFlip[]) ?? [],
    [length, flips] as const,
  );
}

export async function cross(
  page: Page,
  svhs: number[],
  waits: number[] = [],
): Promise<GateHandoff[]> {
  const start = await pinStart(page);
  const height = page.viewportSize()?.height ?? 0;
  const flips = svhs.map((svh, index) => ({
    wait: index === 0 ? 0 : (waits[index - 1] ?? 0),
    to: start + (svh / 100) * height,
  }));
  return scrollTimeline(page, HANDOFF_WINDOW_MS + waits.reduce((a, b) => a + b, 0), flips);
}

export function joint(samples: GateHandoff[]): number {
  return Math.max(
    ...samples.map((sample) => {
      const [first = 0, second = 0] = [...sample.frames].sort((a, b) => b - a);
      return Math.min(first, second);
    }),
  );
}

export type HandoffMeasure = {
  joint: number;
  gapMs: number;
  settleMs: number;
  slide: number;
  outTravel: number;
  inRemaining: number;
};

function gapMs(samples: GateHandoff[]): number {
  return samples.reduce((total, sample, index) => {
    const next = samples[index + 1];
    const dark = Math.max(...sample.frames) < GATE_OVERLAP_CEILING;
    return dark && next ? total + (next.at - sample.at) : total;
  }, 0);
}

function settleMs(samples: GateHandoff[], incoming: number): number {
  const lastBelow = samples.findLastIndex((sample) => sample.frames[incoming] !== 1);
  return samples[lastBelow + 1]?.at ?? Number.POSITIVE_INFINITY;
}

function travelAtHalf(samples: GateHandoff[], frame: number, rising: boolean): number {
  const level = GATE_OUT_READABLE_OPACITY;
  const opacity = (sample: GateHandoff): number => sample.frames[frame] ?? 0;
  const travel = (sample: GateHandoff): number => Math.abs(sample.captions[frame] ?? 0);
  const crossing = samples.findIndex((sample, index) => {
    const next = samples[index + 1];
    if (!next) return false;
    return rising
      ? opacity(sample) < level && opacity(next) >= level
      : opacity(sample) >= level && opacity(next) < level;
  });
  const before = samples[crossing];
  const after = samples[crossing + 1];
  if (!before || !after) return Number.NaN;
  const share = (level - opacity(before)) / (opacity(after) - opacity(before));
  return travel(before) + (travel(after) - travel(before)) * share;
}

export function measureHandoff(
  samples: GateHandoff[],
  frames: { outgoing: number; incoming: number },
): HandoffMeasure {
  const slide = Math.max(...samples.flatMap((sample) => sample.captions.map(Math.abs)));
  return {
    joint: joint(samples),
    gapMs: gapMs(samples),
    settleMs: settleMs(samples, frames.incoming),
    slide,
    outTravel: travelAtHalf(samples, frames.outgoing, false) / slide,
    inRemaining: travelAtHalf(samples, frames.incoming, true) / slide,
  };
}

function seenBetween(
  samples: GateHandoff[],
  frame: number,
  value: (sample: GateHandoff) => number,
  bounds: readonly [number, number],
): boolean {
  return samples.some((sample) => {
    const measured = value(sample);
    return (sample.frames[frame] ?? 0) > 0 && measured > bounds[0] && measured < bounds[1];
  });
}

function expectTiming(measure: HandoffMeasure, label: string): void {
  expect(measure.joint, `${label}: two frames at once`).toBeLessThanOrEqual(GATE_OVERLAP_CEILING);
  expect(measure.gapMs, `${label}: empty stage`).toBeLessThanOrEqual(GATE_GAP_CEILING_MS);
  expect(measure.settleMs, `${label}: settles`).toBeLessThanOrEqual(
    GATE_HANDOFF_CEILING_MS + SAMPLING_SLACK_MS,
  );
  expect(measure.outTravel, `${label}: outgoing readable travel`).toBeGreaterThanOrEqual(
    GATE_OUT_READABLE_TRAVEL,
  );
  expect(
    measure.inRemaining,
    `${label}: incoming travel left when readable`,
  ).toBeGreaterThanOrEqual(GATE_IN_READABLE_REMAINING);
}

function expectTravelSeen(
  samples: GateHandoff[],
  frames: { outgoing: number; incoming: number },
  direction: "down" | "up",
  slide: number,
  label: string,
): void {
  const side = direction === "down" ? -1 : 1;
  const bounds = [INTERMEDIATE_PX, slide - INTERMEDIATE_PX] as const;
  const out = (list: number[]): number => (list[frames.outgoing] ?? 0) * side;
  const into = (list: number[]): number => (list[frames.incoming] ?? 0) * -side;
  const checks: Array<[string, number, (sample: GateHandoff) => number]> = [
    ["caption part way out", frames.outgoing, (sample) => out(sample.captions)],
    ["card part way out", frames.outgoing, (sample) => out(sample.cards)],
    ["caption part way in", frames.incoming, (sample) => into(sample.captions)],
    ["card part way in", frames.incoming, (sample) => into(sample.cards)],
  ];
  for (const [name, frame, value] of checks)
    expect(seenBetween(samples, frame, value, bounds), `${label}: ${name}`).toBe(true);
  for (const frame of [frames.outgoing, frames.incoming])
    expect(
      seenBetween(samples, frame, (sample) => sample.scales[frame] ?? 1, [
        GATE_SLIDE_SCALE + SCALE_SEEN,
        1 - SCALE_SEEN,
      ]),
      `${label}: card scaled part way (frame ${frame})`,
    ).toBe(true);
}

export function expectHandoff(
  samples: GateHandoff[],
  label: string,
  direction: "down" | "up",
  frames: { outgoing: number; incoming: number },
): HandoffMeasure {
  const measure = measureHandoff(samples, frames);
  console.log(
    `handoff ${label}: joint ${measure.joint.toFixed(2)} empty ${measure.gapMs.toFixed(0)}ms settle ${measure.settleMs.toFixed(0)}ms out travel ${(measure.outTravel * 100).toFixed(0)}% in remaining ${(measure.inRemaining * 100).toFixed(0)}% slide ${measure.slide.toFixed(0)}px`,
  );
  expectTiming(measure, label);
  expect(samples.at(-1)?.frames[frames.incoming], `${label}: end`).toBe(1);
  expect(samples.at(-1)?.frames[frames.outgoing], `${label}: end`).toBe(0);
  expectTravelSeen(samples, frames, direction, measure.slide, label);
  return measure;
}

export async function handoffAcross(
  page: Page,
  states: { from: number; to: number },
  label: string,
): Promise<HandoffMeasure> {
  await scrollToSvh(page, gateStateMiddle(states.from));
  const samples = await cross(page, [gateStateMiddle(states.to)]);
  const direction = states.to > states.from ? "down" : "up";
  return expectHandoff(samples, label, direction, { outgoing: states.from, incoming: states.to });
}

export async function flipInsideTheEntrance(
  page: Page,
  label: string,
  waits: number[],
): Promise<number> {
  await scrollToSvh(page, gateStateMiddle(0));
  const targets = waits.map((_, index) => gateStateMiddle(index % 2 === 0 ? 0 : 1));
  const samples = await cross(page, [gateStateMiddle(1), ...targets], waits);
  const peak = joint(samples);
  console.log(`flip ${label}: joint ${peak.toFixed(2)} after ${waits.join(",")}ms`);
  expect(peak, `${label}: two frames at once while reversing`).toBeLessThanOrEqual(
    GATE_OVERLAP_CEILING,
  );
  const settledState = waits.length % 2 === 0 ? 1 : 0;
  await expectRestOn(page, `${label}: after the reversals`, settledState);
  return peak;
}

export type Landing = {
  page: Page;
  start: number;
  height: number;
  label: string;
  states: Set<number>;
};

export async function svhNow(landing: Landing): Promise<number> {
  const y = await landing.page.evaluate(() => window.scrollY);
  return ((y - landing.start) / landing.height) * 100;
}

export async function armScrollEnd(page: Page): Promise<void> {
  await page.evaluate(() => window.gateProbe?.armScrollEnd());
}

export async function scrollEnded(page: Page): Promise<number> {
  await page.evaluate(() => window.gateProbe?.scrollEnded());
  return page.evaluate(() => window.scrollY);
}

export async function scrollInstant(page: Page, y: number): Promise<void> {
  const target = Math.round(y);
  if (Math.round(await page.evaluate(() => window.scrollY)) === target) return;
  await armScrollEnd(page);
  await page.evaluate((to) => window.scrollTo(0, to), target);
  await scrollEnded(page);
}

export async function land(landing: Landing, kind: string, detail: string): Promise<number> {
  const y = await scrollEnded(landing.page);
  const svh = ((y - landing.start) / landing.height) * 100;
  if (svh <= 0 || svh >= GATE_PIN_SVH) return svh < 0 ? -1 : 3;
  const rest = await restNow(landing.page);
  console.log(
    `${kind} ${landing.label} ${detail} y${y} ${svh.toFixed(1)}svh frame ${rest.current} opacity ${rest.full === 1 ? 1 : "below 1"} contrast ${rest.minContrast.toFixed(1)} past edge ${rest.pastEdge}`,
  );
  expectRest(rest, `${kind} ${detail} at ${svh.toFixed(1)}svh`);
  landing.states.add(rest.current);
  return rest.current;
}

export async function walk(
  landing: Landing,
  kind: string,
  press: () => Promise<void>,
  done: (svh: number) => boolean,
): Promise<number[]> {
  landing.states.clear();
  for (let count = 0; count < 90; count += 1) {
    await armScrollEnd(landing.page);
    await press();
    await land(landing, kind, String(count));
    if (done(await svhNow(landing))) break;
  }
  return [...landing.states].sort();
}

const START_SVH = [
  -8,
  0.5,
  20,
  GATE_CUTS[0] - 4,
  GATE_CUTS[0] - 1,
  GATE_CUTS[0] + 1,
  GATE_CUTS[0] + 30,
  GATE_CUTS[1] - 4,
  GATE_CUTS[1] - 1,
  GATE_CUTS[1] + 1,
  GATE_CUTS[1] + 40,
  GATE_PIN_SVH - 3,
];

async function startAt(landing: Landing, svh: number): Promise<number> {
  await scrollInstant(landing.page, landing.start + (svh / 100) * landing.height);
  if (svh <= 0) return -1;
  return (await restNow(landing.page)).current;
}

export async function expectPageKeysNeverSkip(landing: Landing): Promise<void> {
  for (const svh of START_SVH) {
    for (const [key, direction] of [
      ["PageDown", 1],
      ["Space", 1],
      ["PageUp", -1],
    ] as const) {
      const before = await startAt(landing, svh);
      await armScrollEnd(landing.page);
      await landing.page.keyboard.press(key);
      const after = await land(landing, key, `from ${svh}svh`);
      const label = `${landing.label} ${key} from ${svh}svh (state ${before}) lands on ${after}`;
      expect((after - before) * direction, label).toBeGreaterThanOrEqual(0);
      expect((after - before) * direction, label).toBeLessThanOrEqual(1);
    }
  }
}

export type ReversalRow = GateReversalResult & { cut: number; direction: "down" | "up" };

type ReversalMeta = { cut: number; direction: "down" | "up" };

function reversalTrials(
  delays: number[],
  y: (index: number) => number,
): { trials: GateReversal[]; meta: ReversalMeta[] } {
  const trials: GateReversal[] = [];
  const meta: ReversalMeta[] = [];
  for (const [cut, svh] of GATE_CUTS.entries())
    for (const direction of ["down", "up"] as const) {
      const home = direction === "down" ? cut : cut + 1;
      const away = direction === "down" ? cut + 1 : cut;
      for (const delay of delays) {
        meta.push({ cut: svh, direction });
        trials.push({ from: y(home), to: y(away), delay, home });
      }
    }
  return { trials, meta };
}

export async function reversalSweep(page: Page, delays: number[]): Promise<ReversalRow[]> {
  const start = await pinStart(page);
  const height = page.viewportSize()?.height ?? 0;
  const { trials, meta } = reversalTrials(
    delays,
    (index) => start + (gateStateMiddle(index) / 100) * height,
  );
  const results = await page.evaluate(
    ([list, tail]) => window.gateProbe?.reversals(list as GateReversal[], tail as number) ?? [],
    [trials, GATE_REVERSAL_SAMPLE_TAIL_MS] as const,
  );
  return results.map((result, index) => ({ ...result, ...(meta[index] as ReversalMeta) }));
}

function expectReversal(row: ReversalRow, label: string): void {
  const where = `${label} ${row.cut}svh ${row.direction} reversed after ${row.delay}ms`;
  expect(row.joint, `${where}: two frames at once`).toBeLessThanOrEqual(GATE_OVERLAP_CEILING);
  expect(row.settle, `${where}: settles`).toBeLessThanOrEqual(GATE_REVERSAL_SETTLE_MS);
  const home = row.final.indexOf(1);
  expect(
    home >= 0 && row.final.every((opacity, index) => opacity === (index === home ? 1 : 0)),
    `${where}: ends on one exact frame`,
  ).toBe(true);
}

export function expectReversals(rows: ReversalRow[], label: string): void {
  const worst = rows.reduce((best, row) => (row.joint > best.joint ? row : best));
  console.log(
    `reversals ${label}: ${rows.length} trials, worst joint ${worst.joint.toFixed(2)} at ${worst.delay}ms (${worst.cut}svh ${worst.direction}), slowest settle ${Math.max(...rows.map((row) => row.settle)).toFixed(0)}ms`,
  );
  for (const row of rows) expectReversal(row, label);
}

export function defineRestSweeps(locales: readonly Locale[]): void {
  for (const locale of locales) {
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
}

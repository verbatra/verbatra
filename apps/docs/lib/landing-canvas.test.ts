import { describe, expect, it } from "vitest";
import {
  canvasClock,
  type DrawContext,
  drawFeature,
  hash,
  LOOP_SECONDS,
  type Palette,
  PHASE_STEP,
  RUN_SECONDS,
  readPalette,
  runEndSeconds,
  STILL_TIME,
} from "@/lib/landing-canvas";
import { LANDING_FEATURES, type LandingFeatureId } from "@/lib/landing-features";

const PALETTE: Palette = {
  accent: "#a",
  dim: "#d",
  muted: "#m",
  border: "#b",
  card: "#c",
  fg: "#f",
  warn: "#w",
  bad: "#x",
};

const METHODS = [
  "arc",
  "arcTo",
  "beginPath",
  "closePath",
  "fill",
  "fillRect",
  "lineTo",
  "moveTo",
  "restore",
  "save",
  "setLineDash",
  "stroke",
] as const;

type Point = { x: number; y: number };

type Entry = {
  method: string;
  args: number[];
  fill: string;
  stroke: string;
  dashed: boolean;
  alpha: number;
  points: Point[];
};

type Recorder = DrawContext & {
  calls: Record<string, number>;
  colors: Set<string>;
  strokes: Set<string>;
  alphas: number[];
  coordinates: number[];
  log: Entry[];
};

const PATH_METHODS = new Set(["moveTo", "lineTo", "arc", "arcTo"]);

function filledPoints(method: string, numbers: number[], path: Point[]): Point[] {
  if (method === "fill") return [...path];
  if (method !== "fillRect") return [];
  const [x = 0, y = 0, width = 0, height = 0] = numbers;
  return [
    { x, y },
    { x: x + width, y: y + height },
  ];
}

function recorder(): Recorder {
  const calls: Record<string, number> = {};
  const colors = new Set<string>();
  const strokes = new Set<string>();
  const alphas: number[] = [];
  const coordinates: number[] = [];
  const log: Entry[] = [];
  const target: Record<string, unknown> = {};
  let fillColor = "";
  let strokeColor = "";
  let dash: unknown[] = [];
  let path: Point[] = [];
  for (const method of METHODS) {
    target[method] = (...args: unknown[]) => {
      calls[method] = (calls[method] ?? 0) + 1;
      const numbers = args.filter((arg): arg is number => typeof arg === "number");
      coordinates.push(...numbers);
      if (method === "setLineDash") dash = (args[0] as unknown[]) ?? [];
      if (method === "beginPath") path = [];
      if (PATH_METHODS.has(method)) path.push({ x: numbers[0] ?? 0, y: numbers[1] ?? 0 });
      const points = filledPoints(method, numbers, path);
      log.push({
        method,
        args: numbers,
        fill: fillColor,
        stroke: strokeColor,
        dashed: dash.length > 0,
        alpha,
        points,
      });
    };
  }
  let alpha = 1;
  Object.defineProperties(target, {
    globalAlpha: {
      get: () => alpha,
      set: (value: number) => {
        alpha = value;
        alphas.push(value);
      },
    },
    fillStyle: {
      get: () => fillColor,
      set: (value: string) => {
        fillColor = value;
        colors.add(value);
      },
    },
    strokeStyle: {
      get: () => strokeColor,
      set: (value: string) => {
        strokeColor = value;
        colors.add(value);
        strokes.add(value);
      },
    },
    lineWidth: { get: () => 1, set: () => undefined },
  });
  return Object.assign(target, {
    calls,
    colors,
    strokes,
    alphas,
    coordinates,
    log,
  }) as unknown as Recorder;
}

function frame(id: LandingFeatureId, t: number, w = 255, h = 189): Recorder {
  const c = recorder();
  drawFeature(id, c, w, h, t, PALETTE);
  return c;
}

describe("readPalette", () => {
  it("reads each color from its design token and trims it", () => {
    const seen: string[] = [];
    const palette = readPalette((token) => {
      seen.push(token);
      return ` v(${token}) `;
    });
    expect(palette.accent).toBe("v(--accent)");
    expect(seen).toContain("--art-dim");
    expect(Object.values(palette).every((value) => value.startsWith("v(--"))).toBe(true);
  });
});

describe("hash", () => {
  it("is deterministic and stays within the unit interval", () => {
    expect(hash(3, 7)).toBe(hash(3, 7));
    for (let i = 0; i < 50; i += 1) {
      expect(hash(i, i * 3)).toBeGreaterThanOrEqual(0);
      expect(hash(i, i * 3)).toBeLessThanOrEqual(1);
    }
  });
});

const PHASES = LANDING_FEATURES.map((_, index) => index * PHASE_STEP);
const VISIBLE_ALPHA = 0.05;
const WRAP_EPSILON = 0.002;

const WRAPS: Readonly<Record<LandingFeatureId, ReadonlyArray<number>>> = {
  studio: [7, 14, 21, 42],
  handoff: [7.5, 15, 22.5],
  extract: [6, 12, 18],
  watch: [4.5, 9, 13.5, 18],
  types: [7, 14, 21],
  doctor: [7, 14, 21],
};

function inkSignature(c: Recorder): string[] {
  const counts = new Map<string, number>();
  for (const entry of c.log) {
    if (entry.method !== "fill" && entry.method !== "fillRect" && entry.method !== "stroke")
      continue;
    if (entry.alpha < VISIBLE_ALPHA) continue;
    const color = entry.method === "stroke" ? entry.stroke : entry.fill;
    const kind = entry.method === "stroke" ? "stroke" : "fill";
    const key = `${kind}:${color}:${entry.alpha.toFixed(1)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => `${key}x${count}`).sort();
}
const FRAME_STEPS = [0.033, 0.1];
const SIZES = [
  [255, 189],
  [600, 190],
] as const;

function expectSeam(
  id: LandingFeatureId,
  last: number,
  step: number,
  [w, h]: readonly [number, number],
): void {
  const before = frame(id, last, w, h);
  const still = frame(id, STILL_TIME[id], w, h);
  expect(before.coordinates, `${id} ${last} ${w}`).toHaveLength(still.coordinates.length);
  if (step > 0.05) return;
  expect(before.log.map((entry) => entry.method)).toEqual(still.log.map((entry) => entry.method));
  before.coordinates.forEach((value, index) => {
    expect(Math.abs(value - (still.coordinates[index] ?? Number.NaN))).toBeLessThan(8);
  });
  before.alphas.forEach((value, index) => {
    expect(Math.abs(value - (still.alphas[index] ?? Number.NaN))).toBeLessThan(0.2);
  });
}

function radii(c: Recorder): number[] {
  return c.log.flatMap((entry) => {
    if (entry.method === "arc") return [entry.args[2] ?? 0];
    if (entry.method === "arcTo") return [entry.args[4] ?? 0];
    return [];
  });
}

describe("canvasClock", () => {
  for (const { id } of LANDING_FEATURES) {
    describe(id, () => {
      it("plays its bounded run and then holds the still frame", () => {
        const end = runEndSeconds(id, 1.3);
        expect(RUN_SECONDS[id]).toBeGreaterThan(0);
        expect(end).toBeGreaterThanOrEqual(RUN_SECONDS[id]);
        for (const phase of PHASES) {
          const finish = runEndSeconds(id, phase);
          expect(finish).toBeGreaterThanOrEqual(RUN_SECONDS[id]);
          expect(finish).toBeLessThan(RUN_SECONDS[id] + LOOP_SECONDS[id]);
        }
        expect(canvasClock(id, 0, 1.3)).toEqual({ time: 1.3, done: false });
        expect(canvasClock(id, end - 0.01, 1.3).done).toBe(false);
        expect(canvasClock(id, end, 1.3)).toEqual({ time: STILL_TIME[id], done: true });
        expect(canvasClock(id, end * 10, 0).time).toBe(STILL_TIME[id]);
      });

      it("keeps its still time inside the first loop", () => {
        expect(STILL_TIME[id]).toBeGreaterThan(0);
        expect(STILL_TIME[id]).toBeLessThan(LOOP_SECONDS[id]);
      });

      it("ends on exactly the still frame for every phase", () => {
        for (const phase of PHASES) {
          const end = runEndSeconds(id, phase) + phase;
          for (const [w, h] of SIZES) {
            const landed = frame(id, end, w, h);
            const still = frame(id, STILL_TIME[id], w, h);
            expect(landed.log.map((entry) => entry.method)).toEqual(
              still.log.map((entry) => entry.method),
            );
            expect(landed.coordinates).toHaveLength(still.coordinates.length);
            landed.coordinates.forEach((value, index) => {
              expect(value).toBeCloseTo(still.coordinates[index] ?? Number.NaN, 6);
            });
            landed.alphas.forEach((value, index) => {
              expect(value).toBeCloseTo(still.alphas[index] ?? Number.NaN, 6);
            });
          }
        }
      });

      it("draws the last running frame equal to the still frame within one frame step", () => {
        for (const step of FRAME_STEPS) {
          for (const phase of PHASES) {
            for (const [w, h] of SIZES) {
              expectSeam(id, runEndSeconds(id, phase) + phase - step, step, [w, h]);
            }
          }
        }
      });
    });
  }
});

describe("loop wraps", () => {
  for (const { id } of LANDING_FEATURES) {
    it(`${id} shows the same visible ink just before and just after every wrap`, () => {
      for (const wrap of WRAPS[id]) {
        for (const [w, h] of [
          [255, 189],
          [600, 190],
        ] as const) {
          const before = inkSignature(frame(id, wrap - WRAP_EPSILON, w, h));
          const after = inkSignature(frame(id, wrap + WRAP_EPSILON, w, h));
          expect(after, `${id} ${w}x${h} wrap ${wrap}`).toEqual(before);
        }
      }
    });
  }
});

function barWidths(c: Recorder): number[] {
  return c.log
    .filter((entry) => entry.method === "fill" && entry.fill === PALETTE.dim)
    .map((entry) => {
      const xs = entry.points.map((point) => point.x);
      return Math.max(...xs) - Math.min(...xs);
    })
    .sort((left, right) => left - right);
}

describe("studio tab switch", () => {
  it("keeps every value bar width continuous across each wrap", () => {
    for (const wrap of WRAPS.studio) {
      for (const [w, h] of SIZES) {
        const before = barWidths(frame("studio", wrap - WRAP_EPSILON, w, h));
        const after = barWidths(frame("studio", wrap + WRAP_EPSILON, w, h));
        expect(after, `${w}x${h} wrap ${wrap}`).toHaveLength(before.length);
        before.forEach((value, index) => {
          expect(Math.abs(value - (after[index] ?? Number.NaN))).toBeLessThan(0.5);
        });
      }
    }
  });
});

describe("drawFeature", () => {
  for (const { id } of LANDING_FEATURES) {
    describe(id, () => {
      it("draws shapes from the palette only, never text", () => {
        const c = recorder();
        drawFeature(id, c, 340, 190, STILL_TIME[id], PALETTE);
        const drawn = (c.calls.fill ?? 0) + (c.calls.stroke ?? 0) + (c.calls.fillRect ?? 0);
        expect(drawn).toBeGreaterThan(5);
        const allowed = new Set(Object.values(PALETTE));
        for (const color of c.colors) expect(allowed.has(color), color).toBe(true);
      });

      it("keeps every coordinate finite and every alpha in range", () => {
        for (const [w, h] of [
          [340, 190],
          [255, 189],
          [600, 190],
          [900, 190],
          [1, 1],
          [0, 0],
          [20, 400],
          [1e5, 1e5],
          [50, 1e7],
        ] as const) {
          for (const t of [0, 0.7, STILL_TIME[id], 12.34, 100]) {
            const c = recorder();
            drawFeature(id, c, w, h, t, PALETTE);
            expect(c.coordinates.every(Number.isFinite), `${w}x${h}@${t}`).toBe(true);
            expect(
              c.alphas.every((a) => a >= 0 && a <= 1),
              `${w}x${h}@${t}`,
            ).toBe(true);
            expect(
              radii(c).every((r) => r >= 0),
              `radius ${w}x${h}@${t}`,
            ).toBe(true);
          }
        }
      });

      it("is a pure function of time", () => {
        const a = recorder();
        const b = recorder();
        drawFeature(id, a, 340, 190, 5.5, PALETTE);
        drawFeature(id, b, 340, 190, 5.5, PALETTE);
        expect(a.calls).toEqual(b.calls);
        expect(a.coordinates).toEqual(b.coordinates);
      });

      it("moves as time passes", () => {
        const times = [0.3, 1.1, 2.4, 3.9, 5.2];
        const frames = times.map((t) => {
          const c = recorder();
          drawFeature(id, c, 340, 190, t, PALETTE);
          return c.coordinates.join(",");
        });
        expect(new Set(frames).size).toBeGreaterThan(2);
      });
    });
  }

  it("studio shows the review queue, the focus ring and an in-place edit at its still time", () => {
    const still = frame("studio", STILL_TIME.studio);
    expect(still.strokes.has(PALETTE.fg)).toBe(true);
    expect(still.colors.has(PALETTE.warn)).toBe(true);
    expect(still.colors.has(PALETTE.accent)).toBe(true);
  });

  it("studio draws no focus ring while browsing and no warn dot once the queue is cleared", () => {
    const browsing = frame("studio", 0.3);
    expect(browsing.strokes.has(PALETTE.fg)).toBe(false);
    expect(browsing.colors.has(PALETTE.warn)).toBe(true);
    const cleared = frame("studio", 6.3);
    expect(cleared.colors.has(PALETTE.warn)).toBe(false);
    expect(cleared.colors.has(PALETTE.accent)).toBe(true);
  });

  it("studio marks its three tabs as locales and never slides the highlight backwards at the start", () => {
    const markers = frame("studio", 0.4).log.filter(
      (entry) => entry.method === "arc" && entry.args[2] === 3,
    );
    expect(markers).toHaveLength(3);
    const highlight = (t: number) =>
      frame("studio", t)
        .log.filter((entry) => entry.method === "arcTo" && entry.stroke === PALETTE.accent)
        .map((entry) => entry.args);
    expect(highlight(0.1)).toEqual(highlight(0.4));
    expect(highlight(21.1)).not.toEqual(highlight(21.4));
  });

  it("studio visits every locale tab across its run", () => {
    const frames = [0, 1, 2].map((tab) => frame("studio", tab * 7 + 0.7).coordinates.join(","));
    expect(new Set(frames).size).toBe(3);
  });

  it("handoff draws accent locks and a sweep that skips the locked rows at its still time", () => {
    const shackles = (t: number) =>
      frame("handoff", t).log.filter(
        (entry) =>
          entry.method === "arc" &&
          entry.args[3] === Math.PI &&
          entry.args[4] === 0 &&
          entry.stroke === PALETTE.accent,
      );
    const sweep = (t: number) =>
      frame("handoff", t).log.filter(
        (entry) => entry.method === "fillRect" && entry.fill === PALETTE.fg,
      );
    expect(shackles(STILL_TIME.handoff)).toHaveLength(2);
    expect(sweep(STILL_TIME.handoff).length).toBeGreaterThan(0);
    expect(shackles(1)).toHaveLength(0);
    expect(sweep(1)).toHaveLength(0);
    expect(frame("handoff", STILL_TIME.handoff).colors.has(PALETTE.warn)).toBe(true);
    expect(frame("handoff", 6.8).colors.has(PALETTE.warn)).toBe(false);
  });

  it("extract lands warn new-key dots only after the scan has crossed a call", () => {
    const before = frame("extract", 0.2);
    expect(before.colors.has(PALETTE.warn)).toBe(false);
    const still = frame("extract", STILL_TIME.extract);
    expect(still.colors.has(PALETTE.warn)).toBe(true);
    expect(still.calls.setLineDash).toBeGreaterThan(0);
  });

  it("extract parks the full-strength scan line just past the last call once it has finished", () => {
    const scan = (t: number) =>
      frame("extract", t)
        .log.filter(
          (entry) =>
            entry.method === "lineTo" &&
            entry.stroke === PALETTE.accent &&
            (entry.args[0] ?? 0) < 100,
        )
        .map((entry) => entry.args[1]);
    expect(scan(3.7)).toEqual(scan(4.4));
    expect(scan(4.4)).toEqual(scan(5));
    expect(scan(4.4)[0]).toBeGreaterThan(140);
    expect(scan(4.4)[0]).toBeLessThan(160);
    const alphas = frame("extract", 4.4).log.filter(
      (entry) => entry.method === "stroke" && entry.stroke === PALETTE.accent && entry.alpha === 1,
    );
    expect(alphas.length).toBeGreaterThan(0);
  });

  it("extract never draws on the exposed target file edge beyond its static outline", () => {
    const edge = (t: number) => {
      const c = frame("extract", t, 340, 190);
      const xs = c.log.filter((e) => e.method === "arcTo").map((e) => e.args[0] ?? 0);
      const right = Math.max(...xs);
      return c.log.filter((e) => e.method !== "setLineDash" && (e.args[0] ?? 0) > right - 4);
    };
    const resting = edge(0);
    expect(resting.length).toBeGreaterThan(1);
    for (const t of [0.9, 1.5, 2.2, 3, 3.8, 4.3, 5.5]) {
      expect(edge(t).map((e) => e.args)).toEqual(resting.map((e) => e.args));
    }
  });

  it("watch keeps its watcher running and refills the one row of each target", () => {
    const orbit = (t: number) =>
      frame("watch", t).log.find(
        (entry) => entry.method === "arc" && entry.args[2] === 4 && entry.args[3] === 0,
      )?.args;
    expect(orbit(STILL_TIME.watch)).toBeDefined();
    expect(orbit(STILL_TIME.watch)).not.toEqual(orbit(STILL_TIME.watch + 0.4));
    expect(orbit(0.5)).not.toEqual(orbit(1.1));
    const accentFills = (t: number) =>
      frame("watch", t).log.filter(
        (entry) => entry.method === "fill" && entry.fill === PALETTE.accent,
      ).length;
    expect(accentFills(STILL_TIME.watch)).toBeGreaterThan(accentFills(0.5));
    const wrapped = frame("watch", STILL_TIME.watch + LOOP_SECONDS.watch).coordinates;
    frame("watch", STILL_TIME.watch).coordinates.forEach((value, index) => {
      expect(value).toBeCloseTo(wrapped[index] ?? Number.NaN, 6);
    });
    expect(frame("watch", STILL_TIME.watch).coordinates).not.toEqual(
      frame("watch", STILL_TIME.watch + 4.5).coordinates,
    );
  });

  it("types shows the failed build with a typo pill and a bad bar at its still time", () => {
    const early = frame("types", 1);
    expect(early.colors.has(PALETTE.bad)).toBe(false);
    const still = frame("types", STILL_TIME.types);
    expect(still.colors.has(PALETTE.bad)).toBe(true);
    const badCorners = still.log.filter(
      (entry) => entry.method === "arcTo" && entry.fill === PALETTE.bad && entry.alpha > 0.5,
    );
    expect(badCorners.length).toBeGreaterThanOrEqual(8);
  });

  it("doctor never fills the key region and draws the max-tokens ceiling as a warn dashed line", () => {
    for (const [w, h] of SIZES) {
      const avail = Math.min(Math.max(w - 24, 0), 440);
      const regionX = (w - avail) / 2 + avail * 0.56;
      const keyY = h / 2 - 32;
      for (let t = 0; t < LOOP_SECONDS.doctor; t += 0.1) {
        const filled = frame("doctor", t, w, h).log.filter(
          (entry) =>
            (entry.method === "fill" || entry.method === "fillRect") &&
            entry.fill === PALETTE.accent &&
            entry.points.some(
              (point) => point.x >= regionX && point.y >= keyY - 12 && point.y <= keyY + 12,
            ),
        );
        expect(filled, `${w}x${h} t=${t}`).toHaveLength(0);
      }
    }
    const ceiling = frame("doctor", STILL_TIME.doctor).log.filter(
      (entry) => entry.method === "stroke" && entry.stroke === PALETTE.warn && entry.dashed,
    );
    expect(ceiling.length).toBeGreaterThan(0);
  });
});

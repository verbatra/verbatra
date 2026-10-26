import { describe, expect, it } from "vitest";
import {
  canvasClock,
  type DrawContext,
  drawFeature,
  hash,
  type Palette,
  RUN_SECONDS,
  readPalette,
  STILL_TIME,
} from "@/lib/landing-canvas";
import { LANDING_FEATURES } from "@/lib/landing-features";

const PALETTE: Palette = {
  accent: "#a",
  dim: "#d",
  muted: "#m",
  border: "#b",
  card: "#c",
  fg: "#f",
  warn: "#w",
  bad: "#x",
  bg: "#g",
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

type Recorder = DrawContext & {
  calls: Record<string, number>;
  colors: Set<string>;
  strokes: Set<string>;
  alphas: number[];
  coordinates: number[];
};

function recorder(): Recorder {
  const calls: Record<string, number> = {};
  const colors = new Set<string>();
  const strokes = new Set<string>();
  const alphas: number[] = [];
  const coordinates: number[] = [];
  const target: Record<string, unknown> = {};
  for (const method of METHODS) {
    target[method] = (...args: unknown[]) => {
      calls[method] = (calls[method] ?? 0) + 1;
      for (const arg of args) if (typeof arg === "number") coordinates.push(arg);
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
    fillStyle: { get: () => "", set: (value: string) => void colors.add(value) },
    strokeStyle: {
      get: () => "",
      set: (value: string) => {
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
  }) as unknown as Recorder;
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

describe("canvasClock", () => {
  for (const { id } of LANDING_FEATURES) {
    it(`${id} plays its bounded run and then holds the still frame`, () => {
      expect(RUN_SECONDS[id]).toBeGreaterThan(0);
      expect(canvasClock(id, 0, 1.3)).toEqual({ time: 1.3, done: false });
      expect(canvasClock(id, RUN_SECONDS[id] - 0.01, 0).done).toBe(false);
      expect(canvasClock(id, RUN_SECONDS[id], 1.3)).toEqual({ time: STILL_TIME[id], done: true });
      expect(canvasClock(id, RUN_SECONDS[id] * 10, 0).time).toBe(STILL_TIME[id]);
    });
  }
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
        expect(Object.keys(c)).not.toContain("fillText");
      });

      it("keeps every coordinate finite and every alpha in range", () => {
        for (const [w, h] of [
          [340, 190],
          [280, 190],
          [900, 190],
          [1, 1],
        ] as const) {
          for (const t of [0, 0.7, STILL_TIME[id], 12.34, 100]) {
            const c = recorder();
            drawFeature(id, c, w, h, t, PALETTE);
            expect(c.coordinates.every(Number.isFinite), `${w}x${h}@${t}`).toBe(true);
            expect(
              c.alphas.every((a) => a >= 0 && a <= 1),
              `${w}x${h}@${t}`,
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
        expect(new Set(frames).size).toBeGreaterThan(1);
      });
    });
  }

  it("shows the review cursor and the rejected token at their still times", () => {
    const studio = recorder();
    drawFeature("studio", studio, 340, 190, STILL_TIME.studio, PALETTE);
    expect(studio.strokes.has(PALETTE.fg)).toBe(true);
    const types = recorder();
    drawFeature("types", types, 340, 190, STILL_TIME.types, PALETTE);
    expect(types.colors.has(PALETTE.bad)).toBe(true);
  });

  it("covers the whole studio sweep including the idle gap", () => {
    for (let t = 0; t < 12; t += 0.25) {
      const c = recorder();
      drawFeature("studio", c, 340, 190, t, PALETTE);
      expect(c.calls.stroke).toBeGreaterThan(0);
    }
  });
});

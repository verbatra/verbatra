import { describe, expect, it } from "vitest";
import { TREND_BOX, trendGeometry } from "./trend-geometry.js";

const FILLED = { hollow: false } as const;

describe("trendGeometry", () => {
  it("puts the largest value at the top of the plot and zero on the baseline", () => {
    const geometry = trendGeometry([
      { value: 0, ...FILLED },
      { value: 10, ...FILLED },
    ]);

    expect(geometry.max).toBe(10);
    expect(geometry.dots[0]?.cy).toBe(geometry.baselineY);
    expect(geometry.dots[1]?.cy).toBe(TREND_BOX.padTop);
    expect(geometry.dots[0]?.cx).toBe(TREND_BOX.padX);
    expect(geometry.dots[1]?.cx).toBe(TREND_BOX.width - TREND_BOX.padX);
    expect(geometry.polyline).toBe(
      `${TREND_BOX.padX},${geometry.baselineY} ${TREND_BOX.width - TREND_BOX.padX},${TREND_BOX.padTop}`,
    );
  });

  it("centers a lone point and gives a bar a bounded width", () => {
    const geometry = trendGeometry([{ value: 5, ...FILLED }]);

    expect(geometry.dots[0]?.cx).toBe(TREND_BOX.width / 2);
    expect(geometry.bars[0]?.width).toBeLessThanOrEqual(24);
    expect(geometry.bars[0]?.y).toBe(TREND_BOX.padTop);
  });

  it("skips a gap, hostile and negative values instead of drawing them", () => {
    const geometry = trendGeometry([
      { value: undefined, ...FILLED },
      { value: Number.POSITIVE_INFINITY, ...FILLED },
      { value: Number.NaN, ...FILLED },
      { value: -4, ...FILLED },
      { value: 2, hollow: true },
    ]);

    expect(geometry.dots).toHaveLength(1);
    expect(geometry.dots[0]).toMatchObject({ index: 4, hollow: true });
    expect(geometry.bars).toHaveLength(1);
  });

  it("scales an all-zero series against 1 so nothing divides by zero", () => {
    const geometry = trendGeometry([
      { value: 0, ...FILLED },
      { value: 0, ...FILLED },
    ]);

    expect(geometry.max).toBe(1);
    expect(geometry.dots.every((dot) => dot.cy === geometry.baselineY)).toBe(true);
    expect(geometry.bars.every((bar) => bar.height === 0)).toBe(true);
  });

  it("returns nothing to draw for an empty series", () => {
    expect(trendGeometry([])).toMatchObject({ polyline: "", dots: [], bars: [] });
  });
});

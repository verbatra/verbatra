export const TREND_BOX = {
  width: 480,
  height: 112,
  padX: 14,
  padTop: 10,
  padBottom: 14,
} as const;

export interface TrendPoint {
  readonly value: number | undefined;
  readonly hollow: boolean;
}

export interface TrendDot {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  readonly hollow: boolean;
}

export interface TrendBar {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TrendGeometry {
  readonly max: number;
  readonly baselineY: number;
  readonly polyline: string;
  readonly dots: readonly TrendDot[];
  readonly bars: readonly TrendBar[];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function usable(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

export function trendGeometry(points: readonly TrendPoint[]): TrendGeometry {
  const { width, height, padX, padTop, padBottom } = TREND_BOX;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padTop - padBottom;
  const baselineY = padTop + innerHeight;
  const values = points.map((point) => (usable(point.value) ? point.value : undefined));
  const peak = Math.max(0, ...values.filter(usable));
  const max = peak > 0 ? peak : 1;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const slot = innerWidth / Math.max(points.length, 1);
  const barWidth = Math.min(24, slot * 0.6);

  const dots: TrendDot[] = [];
  const bars: TrendBar[] = [];
  points.forEach((point, index) => {
    const value = values[index];
    if (value === undefined) {
      return;
    }
    const cx = points.length > 1 ? padX + step * index : width / 2;
    const cy = baselineY - (value / max) * innerHeight;
    dots.push({ index, cx: round(cx), cy: round(cy), hollow: point.hollow });
    const barHeight = (value / max) * innerHeight;
    const center = padX + slot * index + slot / 2;
    bars.push({
      index,
      x: round(center - barWidth / 2),
      y: round(baselineY - barHeight),
      width: round(barWidth),
      height: round(barHeight),
    });
  });

  return {
    max,
    baselineY,
    polyline: dots.map((dot) => `${dot.cx},${dot.cy}`).join(" "),
    dots,
    bars,
  };
}

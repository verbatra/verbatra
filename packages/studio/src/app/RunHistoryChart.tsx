import type { ReactNode } from "react";
import { useId } from "react";
import { TREND_BOX, type TrendPoint, trendGeometry } from "../client/trend-geometry.js";

export interface RunHistoryChartProps {
  readonly title: string;
  readonly kind: "line" | "bars";
  readonly points: readonly TrendPoint[];
  readonly labels: readonly string[];
  readonly peak: string;
  readonly note?: string | undefined;
}

export function RunHistoryChart({
  title,
  kind,
  points,
  labels,
  peak,
  note,
}: RunHistoryChartProps): ReactNode {
  const titleId = useId();
  const geometry = trendGeometry(points);
  const drawn = geometry.dots.length;

  return (
    <figure className="m-0 min-w-0" data-run-history-chart={kind}>
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium text-foreground">{title}</span>
        {drawn > 0 ? <span className="text-xs text-muted-foreground">Peak {peak}</span> : null}
      </figcaption>
      {drawn === 0 ? (
        <p className="m-0 rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing to draw: no run in this window has a figure for this.
        </p>
      ) : (
        <svg
          role="img"
          aria-labelledby={titleId}
          focusable="false"
          viewBox={`0 0 ${TREND_BOX.width} ${TREND_BOX.height}`}
          className="block h-auto w-full max-w-xl overflow-visible"
        >
          <title
            id={titleId}
          >{`${title}, ${drawn} of ${points.length} runs, oldest to newest`}</title>
          <line
            x1={TREND_BOX.padX}
            x2={TREND_BOX.width - TREND_BOX.padX}
            y1={geometry.baselineY}
            y2={geometry.baselineY}
            strokeWidth={1}
            className="stroke-border"
          />
          {kind === "line"
            ? geometry.segments.map((segment) => (
                <polyline
                  key={segment}
                  points={segment}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="stroke-primary"
                />
              ))
            : null}
          {kind === "line"
            ? geometry.dots.map((dot) => (
                <circle
                  key={dot.index}
                  cx={dot.cx}
                  cy={dot.cy}
                  r={4}
                  strokeWidth={2}
                  className={
                    dot.hollow ? "fill-card stroke-primary" : "fill-primary stroke-primary"
                  }
                >
                  <title>{labels[dot.index]}</title>
                </circle>
              ))
            : geometry.bars.map((bar) => (
                <rect
                  key={bar.index}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={Math.max(bar.height, 1)}
                  rx={2}
                  strokeWidth={bar.hollow ? 2 : 0}
                  className={bar.hollow ? "fill-card stroke-primary" : "fill-primary"}
                >
                  <title>{labels[bar.index]}</title>
                </rect>
              ))}
        </svg>
      )}
      {note !== undefined ? <p className="m-0 mt-2 text-xs text-muted-foreground">{note}</p> : null}
    </figure>
  );
}

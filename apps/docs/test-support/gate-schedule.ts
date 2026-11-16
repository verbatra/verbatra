type SvhRange = readonly [number, number];

export const GATE_PIN_SVH = 300;

export const GATE_CUTS: readonly [number, number] = [100, 200];

export const GATE_PAGE_STEP_MAX_SVH = 96;

export const GATE_PAGE_STEP_MARGIN_SVH = 4;

export const GATE_SLIDE_PX = 64;

export const GATE_SLIDE_WIDE_PX = 96;

export const GATE_SLIDE_WIDE_REM = 80;

export const GATE_DROP_PX = 12;

export const GATE_SLIDE_SCALE = 0.94;

export const GATE_STAMP_SCALE = 1.6;

export const GATE_CUT_LEAD_SVH = 0.15;

export const GATE_FADE_EXPONENT = 2;

export const GATE_EXIT_MS = 280;

export const GATE_ENTER_DELAY_MS = 260;

export const GATE_ENTER_MS = 320;

export const GATE_STEP_MS = 1;

export const GATE_ACCENT_MS = 300;

export const GATE_HANDOFF_CEILING_MS = 600;

export const GATE_REVERSAL_SETTLE_MS = 1000;

export const GATE_REVERSAL_SAMPLE_SLACK_MS = 300;

export const GATE_REVERSAL_SAMPLE_TAIL_MS = GATE_REVERSAL_SETTLE_MS + GATE_REVERSAL_SAMPLE_SLACK_MS;

export const GATE_LANDING_OFFSET_PX = 56;

export const GATE_MARKER_MIN_PX = 48;

const GATE_MARKER_EDGE_SVH = 1;

export function gateStateRange(index: number): SvhRange {
  const [first, second] = GATE_CUTS;
  const edges = [0, first, second, GATE_PIN_SVH] as const;
  return [edges[index] ?? 0, edges[index + 1] ?? GATE_PIN_SVH];
}

export function gateMarkerRange(index: number): SvhRange {
  const [from, to] = gateStateRange(index);
  return [
    index === 0 ? GATE_MARKER_EDGE_SVH : from,
    index === 2 ? GATE_PIN_SVH - GATE_MARKER_EDGE_SVH : to,
  ];
}

export function gateStateAt(svh: number): number {
  const [first, second] = GATE_CUTS;
  if (svh < first) return 0;
  return svh < second ? 1 : 2;
}

export function gatePercent(svh: number): string {
  return `${Number(((svh / GATE_PIN_SVH) * 100).toFixed(3))}%`;
}

export function gateStateMiddle(index: number): number {
  const [from, to] = gateStateRange(index);
  return (from + to) / 2;
}

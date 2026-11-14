export type SvhRange = readonly [number, number];

export const GATE_PIN_SVH = 215;

export const GATE_CUTS: readonly [number, number] = [82, 157];

export const GATE_STATE_FLOOR_SVH = 40;

export const GATE_SLIDE_PX = 64;

export const GATE_SLIDE_WIDE_PX = 96;

export const GATE_SLIDE_WIDE_REM = 80;

export const GATE_DROP_PX = 12;

export const GATE_SLIDE_SCALE = 0.94;

export const GATE_STAMP_SCALE = 1.6;

export const GATE_CUT_LEAD_SVH = 0.15;

export const GATE_FADE_SPAN = 0.4;

export const GATE_EXIT_MS = 280;

export const GATE_ENTER_DELAY_MS = 160;

export const GATE_ENTER_MS = 380;

export const GATE_ACCENT_DELAY_MS = 200;

export const GATE_ACCENT_MS = 300;

export const GATE_HANDOFF_CEILING_MS = 600;

export const GATE_OVERLAP_CEILING = 0.3;

export const GATE_MARKER_MIN_PX = 48;

export const GATE_MARKER_EDGE_SVH = 1;

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

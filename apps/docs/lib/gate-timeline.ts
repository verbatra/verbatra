export type SvhRange = readonly [number, number];

export type GateLines = {
  readonly from: number;
  readonly step: number;
  readonly span: number;
};

export type GateFramePhases = {
  readonly enterCaption: SvhRange | null;
  readonly enterCard: SvhRange | null;
  readonly lines: GateLines | null;
  readonly element: SvhRange | null;
  readonly marker: SvhRange;
  readonly hold: SvhRange;
  readonly exitCaption: SvhRange | null;
  readonly exitCard: SvhRange | null;
};

export const GATE_PIN_SVH = 150;

export const GATE_SLIDE_PX = 64;

export const GATE_LINE_SHIFT_PX = 24;

export const GATE_DROP_PX = 12;

export const GATE_SLIDE_SCALE = 0.96;

export const GATE_STAMP_SCALE = 1.25;

export const GATE_FRAME_RISE_SVH = 0.4;

export const GATE_CLEAR_SVH = 1;

export const GATE_HOLD_FLOOR_SVH = 34;

export const GATE_PHASES: ReadonlyArray<GateFramePhases> = [
  {
    enterCaption: null,
    enterCard: null,
    lines: null,
    element: [2, 6],
    marker: [1, 6],
    hold: [6, 40],
    exitCaption: [40, 44],
    exitCard: [41, 46],
  },
  {
    enterCaption: [47, 51],
    enterCard: [48, 54],
    lines: { from: 50, step: 1, span: 2 },
    element: [56, 60],
    marker: [47, 54],
    hold: [60, 94],
    exitCaption: [94, 98],
    exitCard: [95, 100],
  },
  {
    enterCaption: [101, 105],
    enterCard: [102, 108],
    lines: { from: 104, step: 1, span: 4 },
    element: [110, 114],
    marker: [101, 108],
    hold: [114, 150],
    exitCaption: null,
    exitCard: null,
  },
];

export function gateFrameFade(index: number): { rise: SvhRange | null; fall: SvhRange | null } {
  const phases = GATE_PHASES[index];
  const start = phases?.enterCaption?.[0];
  const end = phases?.exitCard?.[1];
  return {
    rise: start === undefined ? null : [Number((start - GATE_FRAME_RISE_SVH).toFixed(3)), start],
    fall: end === undefined ? null : [Number((end - GATE_FRAME_RISE_SVH).toFixed(3)), end],
  };
}

export function gatePercent(svh: number): string {
  return `${Number(((svh / GATE_PIN_SVH) * 100).toFixed(3))}%`;
}

export function gateHoldMiddle(index: number): number {
  const [from, to] = GATE_PHASES[index]?.hold ?? [0, 0];
  return (from + to) / 2;
}

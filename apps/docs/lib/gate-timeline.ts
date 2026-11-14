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

export const GATE_SLIDE_WIDE_PX = 96;

export const GATE_SLIDE_WIDE_REM = 80;

export const GATE_LINE_SHIFT_PX = 24;

export const GATE_DROP_PX = 12;

export const GATE_SLIDE_SCALE = 0.94;

export const GATE_STAMP_SCALE = 1.6;

export const GATE_ENTER_OPAQUE = 0.2;

export const GATE_EXIT_OPAQUE = 0.7;

export const GATE_FRAME_RISE_SVH = 0.15;

export const GATE_CARD_FADE_SVH = 3;

export const GATE_CARD_MIN_PAINT = 0.3;

export const GATE_CARD_JOINT_CEILING = 0.6;

export const GATE_CARD_JOINT_SVH = 2;

export const GATE_CARD_VISIBLE = 0.1;

export const GATE_HOLD_FLOOR_SVH = 24;

export const GATE_MARKER_MIN_PX = 48;

export const GATE_SWAP_CEILING_SVH = 28;

export const GATE_PHASES: ReadonlyArray<GateFramePhases> = [
  {
    enterCaption: null,
    enterCard: null,
    lines: null,
    element: [2, 6],
    marker: [1, 46],
    hold: [6, 30],
    exitCaption: [30, 40],
    exitCard: [34, 46],
  },
  {
    enterCaption: [43, 53],
    enterCard: [44, 56],
    lines: { from: 44, step: 1.5, span: 6 },
    element: [64, 70],
    marker: [46, 110],
    hold: [70, 94],
    exitCaption: [94, 104],
    exitCard: [98, 110],
  },
  {
    enterCaption: [107, 117],
    enterCard: [108, 120],
    lines: { from: 108, step: 1.5, span: 6 },
    element: [122, 126],
    marker: [110, 149],
    hold: [126, 150],
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

export function gateCardFade(index: number): { rise: SvhRange | null; fall: SvhRange | null } {
  const phases = GATE_PHASES[index];
  const start = phases?.enterCard?.[0];
  const end = phases?.exitCard?.[1];
  return {
    rise: start === undefined ? null : [start, start + GATE_CARD_FADE_SVH],
    fall: end === undefined ? null : [end - GATE_CARD_FADE_SVH, end],
  };
}

export function gatePercent(svh: number): string {
  return `${Number(((svh / GATE_PIN_SVH) * 100).toFixed(3))}%`;
}

export function gateHoldMiddle(index: number): number {
  const [from, to] = GATE_PHASES[index]?.hold ?? [0, 0];
  return (from + to) / 2;
}

export function gateSwapWindow(index: number): SvhRange {
  const previous = GATE_PHASES[index - 1];
  const phases = GATE_PHASES[index];
  return [previous?.hold[1] ?? 0, phases?.enterCard?.[1] ?? 0];
}

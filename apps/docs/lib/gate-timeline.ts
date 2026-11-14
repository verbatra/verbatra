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

export const GATE_CUTS: ReadonlyArray<number> = [45, 109];

export const GATE_DIM_SVH = 3;

export const GATE_DIM_FLOOR = 0.35;

export const GATE_CUT_LEAD_SVH = 0.15;

export const GATE_CARD_MIN_PAINT = 0.3;

export const GATE_FRAME_PAINTED = 0.01;

export const GATE_HOLD_FLOOR_SVH = 24;

export const GATE_MARKER_MIN_PX = 48;

export const GATE_SWAP_CEILING_SVH = 28;

export const GATE_PHASES: ReadonlyArray<GateFramePhases> = [
  {
    enterCaption: null,
    enterCard: null,
    lines: null,
    element: [2, 6],
    marker: [1, 45],
    hold: [6, 30],
    exitCaption: [33, 45],
    exitCard: [35, 45],
  },
  {
    enterCaption: [45, 55],
    enterCard: [46, 58],
    lines: { from: 46, step: 1.5, span: 6 },
    element: [64, 70],
    marker: [45, 109],
    hold: [70, 94],
    exitCaption: [97, 109],
    exitCard: [99, 109],
  },
  {
    enterCaption: [109, 119],
    enterCard: [110, 122],
    lines: { from: 110, step: 1.5, span: 6 },
    element: [122, 126],
    marker: [109, 149],
    hold: [126, 150],
    exitCaption: null,
    exitCard: null,
  },
];

export function gateFrameFade(index: number): { rise: SvhRange | null; fall: SvhRange | null } {
  const cutIn = GATE_CUTS[index - 1];
  const cutOut = GATE_CUTS[index];
  return {
    rise: cutIn === undefined ? null : [cutIn, Number((cutIn + GATE_DIM_SVH).toFixed(3))],
    fall:
      cutOut === undefined
        ? null
        : [
            Number((cutOut - GATE_DIM_SVH).toFixed(3)),
            Number((cutOut - GATE_CUT_LEAD_SVH).toFixed(3)),
          ],
  };
}

export function gateFrameOpacity(index: number, svh: number): number {
  const { rise, fall } = gateFrameFade(index);
  const cutIn = GATE_CUTS[index - 1];
  const cutOut = GATE_CUTS[index];
  if (cutIn !== undefined && svh < cutIn) return 0;
  if (cutOut !== undefined && svh >= cutOut) return 0;
  const along = (range: SvhRange): number => (svh - range[0]) / (range[1] - range[0]);
  if (rise !== null && svh <= rise[1]) return GATE_DIM_FLOOR + (1 - GATE_DIM_FLOOR) * along(rise);
  if (fall !== null && svh >= fall[0])
    return svh >= fall[1] ? GATE_DIM_FLOOR : 1 - (1 - GATE_DIM_FLOOR) * along(fall);
  return 1;
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

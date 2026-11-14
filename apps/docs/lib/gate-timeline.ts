export const GATE_HOLD_SVH = 36;

export const GATE_CHIP_BUILD_SVH = 8;

export const GATE_ELEMENT_BUILD_SVH = 4;

export const GATE_FADE_SVH = 2;

export const GATE_GAP_SVH = 1;

export type GateRange = readonly [number, number];

export type GateFrameSchedule = {
  readonly fadeIn: GateRange | null;
  readonly build: GateRange;
  readonly fadeOut: GateRange | null;
};

function scheduleFrom(start: number, build: number, last: boolean): [GateFrameSchedule, number] {
  const fadeIn: GateRange | null =
    start === 0 ? null : [start + GATE_GAP_SVH, start + GATE_GAP_SVH + GATE_FADE_SVH];
  const begin = fadeIn === null ? 0 : fadeIn[1] + GATE_GAP_SVH;
  const buildEnd = begin + build;
  const holdEnd = buildEnd + GATE_HOLD_SVH;
  const fadeOut: GateRange | null = last ? null : [holdEnd, holdEnd + GATE_FADE_SVH];
  return [{ fadeIn, build: [begin, buildEnd], fadeOut }, holdEnd + GATE_FADE_SVH];
}

function buildSchedule(): { frames: ReadonlyArray<GateFrameSchedule>; pin: number } {
  const [first, firstEnd] = scheduleFrom(0, GATE_CHIP_BUILD_SVH, false);
  const [second, secondEnd] = scheduleFrom(firstEnd, GATE_ELEMENT_BUILD_SVH, false);
  const [third] = scheduleFrom(secondEnd, GATE_ELEMENT_BUILD_SVH, true);
  const pin = (third.build[1] ?? 0) + GATE_HOLD_SVH;
  return { frames: [first, second, third], pin };
}

export const GATE_SCHEDULE = buildSchedule();

export const GATE_PIN_SVH = GATE_SCHEDULE.pin;

export function gatePercent(svh: number): string {
  return `${Number(((svh / GATE_PIN_SVH) * 100).toFixed(3))}%`;
}

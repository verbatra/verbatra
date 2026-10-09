import type { TerminalProgress } from "@/components/landing/terminal";
import { GATE_CLI_COMMAND, GATE_CLI_LINE, GATE_RUN_LINES } from "@/lib/gate-demo";
import { HOW_STEP_KEYS } from "@/lib/landing-sections";

export type HowStepState = "upcoming" | "current" | "complete";

export const HOW_COMMANDS: ReadonlyArray<string> = [GATE_CLI_COMMAND];

export const HOW_OUTPUTS: Readonly<Record<number, ReadonlyArray<string>>> = { 0: GATE_RUN_LINES };

export const HOW_LINE_DELAY_MS = 960;

const RUN_OUTPUT = HOW_OUTPUTS[0] ?? [];

export const HOW_TOTAL_LINES = HOW_COMMANDS.length + RUN_OUTPUT.length;

const TRANSLATE_AT =
  HOW_COMMANDS.length + 1 + RUN_OUTPUT.findIndex((line) => line.trim() === GATE_CLI_LINE);

function currentStep({ lines, typing }: TerminalProgress): number {
  if (lines === 0) return typing ? 0 : -1;
  if (lines < TRANSLATE_AT) return 1;
  if (lines === TRANSLATE_AT) return 2;
  return 3;
}

export function howStepStates(progress: TerminalProgress): ReadonlyArray<HowStepState> {
  if (progress.lines >= HOW_TOTAL_LINES) return HOW_STEP_KEYS.map(() => "complete");
  const current = currentStep(progress);
  return HOW_STEP_KEYS.map((_, index) => {
    if (index < current) return "complete";
    return index === current ? "current" : "upcoming";
  });
}

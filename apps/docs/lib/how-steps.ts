import type { TerminalProgress } from "@/components/landing/terminal";
import { CHECK_CLI_COMMAND, CHECK_EXIT_CODE, CHECK_RUN_LINES } from "@/lib/check-demo";
import { GATE_CLI_COMMAND, GATE_RUN_LINES } from "@/lib/gate-demo";
import { HOW_STEP_KEYS, type HowStepKey } from "@/lib/landing-sections";

export type HowStepState = "upcoming" | "current" | "complete";

export type HowStepCopy = { key: HowStepKey; title: string; body: string };

export const HOW_COMMANDS: ReadonlyArray<string> = [GATE_CLI_COMMAND, CHECK_CLI_COMMAND];

export const HOW_OUTPUTS: Readonly<Record<number, ReadonlyArray<string>>> = {
  0: GATE_RUN_LINES,
  1: CHECK_RUN_LINES,
};

export const HOW_TITLE = `${GATE_CLI_COMMAND} && ${CHECK_CLI_COMMAND}`;

export const HOW_LINE_DELAY_MS = 960;

export const HOW_TOTAL_LINES = HOW_COMMANDS.length + GATE_RUN_LINES.length + CHECK_RUN_LINES.length;

const CHECK_TYPED_AT = 1 + GATE_RUN_LINES.length;

function currentStep({ lines, typing }: TerminalProgress): number {
  if (lines === 0) return typing ? 0 : -1;
  if (lines > CHECK_TYPED_AT || (lines === CHECK_TYPED_AT && typing)) return 2;
  return 1;
}

export function howStepStates(progress: TerminalProgress): ReadonlyArray<HowStepState> {
  if (progress.lines >= HOW_TOTAL_LINES) return HOW_STEP_KEYS.map(() => "complete");
  const current = currentStep(progress);
  return HOW_STEP_KEYS.map((_, index) => {
    if (index < current) return "complete";
    return index === current ? "current" : "upcoming";
  });
}

type StepTranslator = (key: string, values?: Record<string, number>) => string;

export function howStepCopy(t: StepTranslator): ReadonlyArray<HowStepCopy> {
  return HOW_STEP_KEYS.map((key) => ({
    key,
    title: t(`steps.${key}.title`),
    body: t(`steps.${key}.body`, { code: CHECK_EXIT_CODE }),
  }));
}

import { GATE_REFUSAL, GATE_SOURCE_VALUES } from "@/lib/gate-demo";

export const CHECK_CLI_COMMAND = "verbatra check";

export const CHECK_LOCALE = "de";

export const CHECK_MISSING_KEYS: ReadonlyArray<string> = [GATE_REFUSAL.key];

export const CHECK_UP_TO_DATE = Object.keys(GATE_SOURCE_VALUES).length - CHECK_MISSING_KEYS.length;

export const CHECK_EXIT_CODE = 1;

export const CHECK_LOCALE_LINE = `  ${CHECK_LOCALE}: ${CHECK_MISSING_KEYS.length} missing, 0 stale, ${CHECK_UP_TO_DATE} up-to-date (out of sync)`;

export const CHECK_OVERALL_LINE = "out of sync (run verbatra translate to update)";

export const CHECK_RUN_LINES: ReadonlyArray<string> = [
  CHECK_CLI_COMMAND,
  CHECK_LOCALE_LINE,
  CHECK_OVERALL_LINE,
];

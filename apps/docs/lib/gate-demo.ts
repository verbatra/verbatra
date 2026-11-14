import { CHECK_CLI_COMMAND, CHECK_OVERALL_LINE, checkLocaleLine } from "@/lib/check-demo";
import {
  HERO_CHECK_COMMAND,
  HERO_TERMINAL_LOCALES,
  HERO_TERMINAL_SOURCE,
  HERO_TRANSLATE_COMMAND,
} from "@/lib/hero-terminal";

export const GATE_KEY = "profile.greeting";

export const GATE_PLACEHOLDER = "{name}";

export const GATE_SOURCE: string =
  HERO_TERMINAL_SOURCE.find(({ key }) => key === GATE_KEY)?.value ?? "";

export const GATE_SOURCE_BEFORE = "Welcome, {name}!";

export const GATE_DE_OLD = "Willkommen, {name}!";

export const GATE_DE_CANDIDATE = "Willkommen zurück!";

export const GATE_SOURCE_LOCALE = "en";

export const GATE_LOCALE: string = HERO_TERMINAL_LOCALES[0]?.locale ?? "";

export const GATE_SOURCE_FILE = `${GATE_SOURCE_LOCALE}.json`;

export const GATE_TARGET_FILE = `${GATE_LOCALE}.json`;

export const GATE_PROVIDER_ID = "anthropic";

export const GATE_MODEL = "claude-sonnet-4-6";

export const GATE_DOCS_PATH = "/docs/translation-safety";

export const GATE_TRANSLATE_COMMAND = HERO_TRANSLATE_COMMAND;

export const GATE_CHECK_COMMAND = HERO_CHECK_COMMAND;

export const GATE_TRANSLATE_HEADER = "verbatra translate";

export const GATE_CHECK_HEADER = CHECK_CLI_COMMAND;

export const GATE_CHECK_EXIT_CODE = 1;

export const GATE_REFUSED_BADGE = "1 integrity-withheld";

const unchanged = HERO_TERMINAL_SOURCE.length - 1;

export const GATE_REFUSED_LINES: ReadonlyArray<string> = [
  `  ${GATE_LOCALE}: failed, 0 translated, ${unchanged} unchanged, ${GATE_REFUSED_BADGE}`,
  "    integrity-withheld:",
  `      ${GATE_KEY}: placeholder (-${GATE_PLACEHOLDER})`,
  "0 succeeded, 0 partial, 1 failed",
];

export const GATE_CHECK_LINES: ReadonlyArray<string> = [
  checkLocaleLine(GATE_LOCALE, 1, unchanged),
  CHECK_OVERALL_LINE,
];

export const GATE_STATES = ["candidate", "refused", "stale"] as const;

export type GateState = (typeof GATE_STATES)[number];

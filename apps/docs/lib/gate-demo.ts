import { CHECK_CLI_COMMAND, CHECK_OVERALL_LINE, checkLocaleLine } from "@/lib/check-demo";
import {
  HERO_CHECK_COMMAND,
  HERO_TERMINAL_LOCALES,
  HERO_TERMINAL_SOURCE,
  HERO_TRANSLATE_COMMAND,
} from "@/lib/hero-terminal";
import { PLAYGROUND_METADATA } from "@/lib/landing-playground";

export const GATE_KEY = "profile.greeting";

export const GATE_PLACEHOLDER = "{name}";

export const GATE_SOURCE = "Good to see you, {name}!";

export function fixtureValueOf(key: string): string {
  const entry = HERO_TERMINAL_SOURCE.find((candidate) => candidate.key === key);
  if (entry === undefined) throw new Error(`the hero fixture has no key ${key}`);
  return entry.value;
}

export function firstTargetLocale(locales: ReadonlyArray<{ readonly locale: string }>): string {
  const first = locales[0];
  if (first === undefined) throw new Error("the hero fixture lists no target locale");
  return first.locale;
}

export const GATE_SOURCE_BEFORE: string = fixtureValueOf(GATE_KEY);

export const GATE_LOCALE: string = firstTargetLocale(HERO_TERMINAL_LOCALES);

export const GATE_DE_OLD = "Willkommen, {name}!";

export const GATE_DE_CANDIDATE = "Schön, Sie zu sehen!";

export const GATE_SOURCE_LOCALE = "en";

export const GATE_SOURCE_FILE = `${GATE_SOURCE_LOCALE}.json`;

export const GATE_TARGET_FILE = `${GATE_LOCALE}.json`;

export const GATE_MODEL: string = PLAYGROUND_METADATA.model;

export const GATE_DOCS_PATH = "/docs/translation-safety";

export const GATE_TRANSLATE_COMMAND = HERO_TRANSLATE_COMMAND;

export const GATE_CHECK_COMMAND = HERO_CHECK_COMMAND;

export const GATE_TRANSLATE_HEADER = "verbatra translate";

export const GATE_CHECK_HEADER = CHECK_CLI_COMMAND;

export const GATE_CHECK_EXIT_CODE = 1;

const [targetGroup = "", targetLeaf = ""] = GATE_KEY.split(".");

export const GATE_TARGET_GROUP = targetGroup;

export const GATE_TARGET_LEAF = targetLeaf;

export const GATE_TARGET_ELISION = "...";

export const GATE_TARGET_EXCERPT: ReadonlyArray<string> = [
  `"${GATE_TARGET_GROUP}": {`,
  `  ${JSON.stringify(GATE_TARGET_LEAF)}: "${GATE_DE_OLD}",`,
  `  ${GATE_TARGET_ELISION}`,
];

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

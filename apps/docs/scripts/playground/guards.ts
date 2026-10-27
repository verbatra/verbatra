import { redact } from "@verbatra/sdk";
import {
  LANGUAGE_ALLOWLIST,
  MAX_ITEM_LENGTH,
  MAX_ITEMS,
  MAX_LANGUAGES,
  PLAYGROUND_KEY_VAR,
  PROVIDER_KEY_VAR,
} from "./limits.ts";
import type { SourceItem } from "./source.ts";

export class PlaygroundRefusal extends Error {
  override readonly name = "PlaygroundRefusal";
}

export type Environment = Record<string, string | undefined>;

export interface EnvironmentProbe {
  readonly env: Environment;
  readonly isTTY: boolean;
  readonly insideContainer: boolean;
}

const ITEM_ID_PATTERN = /^[a-z][A-Za-z]*$/;
const SOURCE_PLACEHOLDER_PATTERN = /\{[a-z][A-Za-z]*\}/g;
const SOURCE_TEXT_PATTERN = /^[\p{L} .,!?'-]+$/u;

const SENSITIVE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, "an email address"],
  [/[a-z][a-z0-9+.-]*:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}\b/i, "a URL"],
  [/\+?\(?\d[\d\s().-]{5,}\d/, "a phone number"],
  [/\d{2,}/, "a digit sequence"],
  [/(^|[^\w])@[\w.]+/, "an @handle"],
  [/\b(sk|pk|rk|ghp|gho|ghs|xox[abprs]|AIza|AKIA)[-_A-Za-z0-9]{6,}/, "a key-like string"],
  [/[A-Za-z0-9_-]{24,}/, "a key-like string"],
];

function isSet(value: string | undefined): boolean {
  return value !== undefined && value !== "";
}

export function assertSafeEnvironment(probe: EnvironmentProbe): void {
  if (probe.env.CI !== undefined) {
    throw new PlaygroundRefusal("Refusing to run: the CI environment variable is set.");
  }
  if (probe.env.GITHUB_ACTIONS !== undefined) {
    throw new PlaygroundRefusal("Refusing to run: GITHUB_ACTIONS is set.");
  }
  if (probe.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new PlaygroundRefusal("Refusing to run: NODE_ENV is production.");
  }
  if (probe.insideContainer) {
    throw new PlaygroundRefusal(
      "Refusing to run: /.dockerenv or /run/.containerenv exists, this looks like a container.",
    );
  }
  if (!probe.isTTY) {
    throw new PlaygroundRefusal("Refusing to run: no TTY. Run it by hand in a terminal.");
  }
  if (isSet(probe.env[PROVIDER_KEY_VAR])) {
    throw new PlaygroundRefusal(
      `Refusing to run: ${PROVIDER_KEY_VAR} is already set. Unset it; the playground uses ${PLAYGROUND_KEY_VAR} only.`,
    );
  }
}

export function bridgePlaygroundKey(env: Environment): void {
  const key = env[PLAYGROUND_KEY_VAR];
  if (key === undefined || key === "") {
    throw new PlaygroundRefusal(
      `Refusing to write: ${PLAYGROUND_KEY_VAR} is not set. Put it in apps/docs/scripts/playground/.env.local.`,
    );
  }
  if (isSet(env[PROVIDER_KEY_VAR])) {
    throw new PlaygroundRefusal(`Refusing to write: ${PROVIDER_KEY_VAR} is already set.`);
  }
  env[PROVIDER_KEY_VAR] = key;
}

function assertItemShape(item: SourceItem, seen: Set<string>): void {
  if (!ITEM_ID_PATTERN.test(item.id)) {
    throw new PlaygroundRefusal(`Item id "${item.id}" must be camelCase letters only.`);
  }
  if (seen.has(item.id)) {
    throw new PlaygroundRefusal(`Item id "${item.id}" appears twice.`);
  }
  seen.add(item.id);
  if ([...item.text].length > MAX_ITEM_LENGTH) {
    throw new PlaygroundRefusal(`Item "${item.id}" is longer than ${MAX_ITEM_LENGTH} characters.`);
  }
  const withoutPlaceholders = item.text.replaceAll(SOURCE_PLACEHOLDER_PATTERN, "x");
  if (!SOURCE_TEXT_PATTERN.test(withoutPlaceholders)) {
    throw new PlaygroundRefusal(
      `Item "${item.id}" may hold only letters, spaces, . , ! ? ' - and {name} placeholders.`,
    );
  }
}

export function assertInputLimits(items: readonly SourceItem[]): void {
  if (items.length === 0) {
    throw new PlaygroundRefusal("The playground source holds no items.");
  }
  if (items.length > MAX_ITEMS) {
    throw new PlaygroundRefusal(`The playground source holds more than ${MAX_ITEMS} items.`);
  }
  const seen = new Set<string>();
  for (const item of items) {
    assertItemShape(item, seen);
  }
}

export function sensitiveFinding(text: string): string | undefined {
  for (const [pattern, label] of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      return label;
    }
  }
  return redact(text) === text ? undefined : "a key-like string";
}

export function assertNoSensitiveData(items: readonly SourceItem[]): void {
  for (const item of items) {
    const finding = sensitiveFinding(item.text);
    if (finding !== undefined) {
      throw new PlaygroundRefusal(`Item "${item.id}" looks like it contains ${finding}.`);
    }
  }
}

function isAllowedLanguage(language: string): boolean {
  return (LANGUAGE_ALLOWLIST as readonly string[]).includes(language);
}

export function assertLanguagesAllowed(languages: readonly string[]): void {
  if (languages.length === 0) {
    throw new PlaygroundRefusal("No target language is selected.");
  }
  if (languages.length > MAX_LANGUAGES) {
    throw new PlaygroundRefusal(`More than ${MAX_LANGUAGES} target languages are selected.`);
  }
  if (new Set(languages).size !== languages.length) {
    throw new PlaygroundRefusal("A target language is selected twice.");
  }
  for (const language of languages) {
    if (!isAllowedLanguage(language)) {
      throw new PlaygroundRefusal(
        `Target language "${language}" is not in the allowlist (${LANGUAGE_ALLOWLIST.join(", ")}).`,
      );
    }
  }
}

export function redactForOutput(message: string, env: Environment): string {
  let safe = redact(message);
  for (const name of [PLAYGROUND_KEY_VAR, PROVIDER_KEY_VAR]) {
    const value = env[name];
    if (value !== undefined && value.length > 0) {
      safe = safe.replaceAll(value, "[redacted]");
    }
  }
  return safe;
}

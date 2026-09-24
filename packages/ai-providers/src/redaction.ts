import { keyEnvVarNames } from "./key-env-vars.js";

const REDACTED = "[REDACTED]";

export const MIN_SCRUBBED_VALUE_LENGTH = 8;

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const KEY_PATTERNS: readonly RegExp[] = [
  /AIza[0-9A-Za-z_-]{35}/g,
  new RegExp(`${UUID}:fx\\b`, "g"),
];

const SK_TOKEN = /\bsk-[A-Za-z0-9_-]+/g;

const MIN_SK_RANDOM_RUN = 20;

const QUOTE = `(?:\\\\*["'])?`;

const KEY_NAME = "(?:deepl[_-]?(?:(?:api|auth)[_-]?)?|(?:api|auth)[_-]?)key";

const SEPARATOR = "(?:\\s*(?:[:=]|%3D)\\s*|\\s+)";

const DEEPL_KEY_IN_CONTEXT = new RegExp(
  `(\\b${KEY_NAME}${QUOTE}${SEPARATOR}${QUOTE})${UUID}(?::fx)?`,
  "gi",
);

function isRandomRun(segment: string): boolean {
  return segment.length >= MIN_SK_RANDOM_RUN && /[0-9]/.test(segment) && /[A-Za-z]/.test(segment);
}

function redactSkToken(token: string): string {
  return token.slice(3).split(/[_-]/).some(isRandomRun) ? REDACTED : token;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonEscaped(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function configuredKeyValues(): string[] {
  const values = new Set<string>();
  for (const name of keyEnvVarNames()) {
    const value = process.env[name];
    if (value !== undefined && value.length >= MIN_SCRUBBED_VALUE_LENGTH) {
      values.add(value);
      values.add(jsonEscaped(value));
    }
  }
  return [...values].sort((a, b) => b.length - a.length);
}

function scrubValues(text: string): string {
  const values = configuredKeyValues();
  if (values.length === 0) {
    return text;
  }
  return text.replace(new RegExp(values.map(escapeForRegExp).join("|"), "g"), REDACTED);
}

function scrubPatterns(text: string): string {
  let out = text.replace(DEEPL_KEY_IN_CONTEXT, `$1${REDACTED}`).replace(SK_TOKEN, redactSkToken);
  for (const pattern of KEY_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redactKeys(text: string): string {
  return scrubPatterns(scrubValues(text));
}

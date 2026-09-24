import { keyEnvVarNames } from "./key-env-vars.js";

const REDACTED = "[REDACTED]";

export const MIN_SCRUBBED_VALUE_LENGTH = 8;

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const KEY_PATTERNS: readonly RegExp[] = [
  /AIza[0-9A-Za-z_-]{35}/g,
  new RegExp(`${UUID}:fx\\b`, "g"),
];

const SK_TOKEN = /(?:(?<![A-Za-z0-9])|(?<=\\[bfnrt])|(?<=\\u[0-9A-Fa-f]{4}))sk-[A-Za-z0-9_-]+/g;

const KNOWN_SK_PREFIX = /^sk-(?:ant|proj|svcacct|admin)-/;

const MIN_SK_ALPHANUMERICS = 32;

const MIN_KNOWN_PREFIX_TAIL_ALPHANUMERICS = 20;

const QUOTE = `(?:\\\\*["'])?`;

const KEY_NAME = "(?:deepl[_-]?(?:(?:api|auth)[_-]?)?|(?:api|auth)[_-]?)key";

const SEPARATOR = "(?:\\s*(?:[:=]|%3D)\\s*|\\s+)";

const DEEPL_KEY_IN_CONTEXT = new RegExp(
  `(\\b${KEY_NAME}${QUOTE}${SEPARATOR}${QUOTE})${UUID}(?::fx)?`,
  "gi",
);

function alphanumericCount(text: string): number {
  return text.replace(/[^A-Za-z0-9]/g, "").length;
}

function hasKnownPrefixAndTail(token: string): boolean {
  const prefix = KNOWN_SK_PREFIX.exec(token)?.[0];
  return (
    prefix !== undefined &&
    alphanumericCount(token.slice(prefix.length)) >= MIN_KNOWN_PREFIX_TAIL_ALPHANUMERICS
  );
}

function redactSkToken(token: string): string {
  if (hasKnownPrefixAndTail(token) || alphanumericCount(token.slice(3)) >= MIN_SK_ALPHANUMERICS) {
    return REDACTED;
  }
  return token;
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

import { keyEnvVarNames } from "./key-env-vars.js";

const REDACTED = "[REDACTED]";

export const MIN_SCRUBBED_VALUE_LENGTH = 8;

const KEY_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?::fx)?/g,
];

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function configuredKeyValues(): string[] {
  const values = new Set<string>();
  for (const name of keyEnvVarNames()) {
    const value = process.env[name];
    if (value !== undefined && value.length >= MIN_SCRUBBED_VALUE_LENGTH) {
      values.add(value);
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
  let out = text;
  for (const pattern of KEY_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redactKeys(text: string): string {
  return scrubPatterns(scrubValues(text));
}

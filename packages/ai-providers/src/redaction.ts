import { keyEnvVarNames } from "./key-env-vars.js";

const REDACTED = "[REDACTED]";

const KEY_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?::fx)?/g,
];

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scrubValue(text: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    return text;
  }
  return text.replace(new RegExp(escapeForRegExp(value), "g"), REDACTED);
}

function scrubPatterns(text: string): string {
  let out = text;
  for (const pattern of KEY_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redact(text: string, secret = process.env.ANTHROPIC_API_KEY): string {
  return scrubValue(scrubPatterns(text), secret);
}

function configuredKeyValues(): string[] {
  const values: string[] = [];
  for (const name of keyEnvVarNames()) {
    const value = process.env[name];
    if (value !== undefined && value.length > 0) {
      values.push(value);
    }
  }
  return values.sort((a, b) => b.length - a.length);
}

export function redactKeys(text: string): string {
  let out = text;
  for (const value of configuredKeyValues()) {
    out = scrubValue(out, value);
  }
  return scrubPatterns(out);
}

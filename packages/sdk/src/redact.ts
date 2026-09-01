const REDACTED = "[REDACTED]";

const KEY_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?::fx)?/g,
];

const PROVIDER_ENV_VAR_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPL_API_KEY",
  "GOOGLE_TRANSLATE_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
] as const;

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scrubConfiguredEnvValues(text: string): string {
  let out = text;
  for (const name of PROVIDER_ENV_VAR_NAMES) {
    const value = process.env[name];
    if (value !== undefined && value.length > 0) {
      out = out.replace(new RegExp(escapeForRegExp(value), "g"), REDACTED);
    }
  }
  return out;
}

/**
 * Scrubs provider API key shapes and any currently configured provider environment variable value
 * out of a string, replacing each match with `[REDACTED]`.
 *
 * Two independent passes run: a set of shape patterns for the major providers (OpenAI-style `sk-`
 * keys, Gemini-style `AIza` keys, and hex UUID-shaped keys, with or without a `:fx` suffix), and an
 * exact-value scrub of whatever `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
 * `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`, or `OPENAI_COMPATIBLE_API_KEY` currently holds in
 * the process environment. Use this on any text a surface returns to a caller that did not itself
 * generate that text, such as a file path, a config value, or an upstream error message, so a key
 * value already present in the environment or written by a user can never reach an agent, a
 * browser tab, or a log line.
 *
 * @param text - The text to scrub.
 * @returns The same text with every matching key shape and configured key value replaced by
 * `[REDACTED]`.
 *
 * @example
 * ```ts
 * import { redact } from "@verbatra/sdk";
 *
 * redact("key is sk-abcdEFGH12345678 in the log");
 * // "key is [REDACTED] in the log"
 * ```
 */
export function redact(text: string): string {
  let out = text;
  for (const pattern of KEY_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return scrubConfiguredEnvValues(out);
}

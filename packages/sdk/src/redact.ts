import { redactKeys } from "@verbatra/ai-providers";

/**
 * Scrubs provider API key shapes and any currently configured provider environment variable value
 * out of a string, replacing each match with `[REDACTED]`.
 *
 * Two independent passes run: a set of shape patterns for the major providers (OpenAI-style `sk-`
 * keys, Gemini-style `AIza` keys, and hex UUID-shaped keys, with or without a `:fx` suffix), and an
 * exact-value scrub of whatever `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
 * `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`, or `OPENAI_COMPATIBLE_API_KEY` currently holds in
 * the process environment, plus the variable an `openai-compatible` provider names through
 * `apiKeyEnvVar` once {@link loadConfig} has loaded a config declaring it or that provider has been
 * built. Use this on any text a surface returns to a caller that did not itself generate that text,
 * such as a file path, a config value, or an upstream error message, so a key value already present
 * in the environment or written by a user can never reach an agent, a browser tab, or a log line.
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
  return redactKeys(text);
}

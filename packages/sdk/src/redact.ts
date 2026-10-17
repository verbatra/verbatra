import { redactKeys } from "@verbatra/ai-providers";

/**
 * Scrubs provider API key shapes and any currently configured provider environment variable value
 * out of a string, replacing each match with `[REDACTED]`.
 *
 * Two independent passes run: a set of shape patterns for the major providers (an `sk-` token
 * followed by at least 32 letters and digits, counted across its `-` and `_` segments, whatever
 * its prefix, when no letter or digit directly precedes it: a JSON escape such as `\n` or
 * `\u0007`, a percent-encoded character such as `%3D`, an ANSI CSI sequence such as `\x1b[31m`,
 * `\x1b[2K` or `\x1b[?25h`, an ANSI charset designation such as `\x1b(B`, or either ANSI form
 * JSON-escaped as `\u001b`, counts as a boundary, so `sk-SK` or `sk-banner_headline` stays
 * readable while a long Slovak-like key such as `sk-SK_settings_notifications_email_digest` or a
 * long camelCase key such as `sk-onboardingWelcomeScreenPrimaryButton` is redacted;
 * Gemini-style `AIza` keys; a DeepL free key's hex UUID with its `:fx`
 * suffix anywhere; and a bare hex UUID only in a key context, a `DeepL-Auth-Key` header or an
 * `auth_key`, `authKey`, `auth-key`, `api_key`, `deeplKey`, `DEEPL_API_KEY`, or `DEEPL_AUTH_KEY`
 * name followed by `:`, `=`, URL-encoded `%3D`, or whitespace, quoted or with JSON-escaped quotes,
 * so an unrelated UUID in a path or an id stays readable), and an exact-value scrub, in raw and in
 * JSON-escaped form, of whatever `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
 * `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`, `OPENAI_COMPATIBLE_API_KEY`, or
 * `LIBRETRANSLATE_API_KEY` currently holds in the process environment, plus any variable declared as a key source: the one an
 * `openai-compatible` provider names through `apiKeyEnvVar` is declared when {@link loadConfig}
 * loads a config naming it or when that provider is built, and {@link declareProviderKeyEnvVar}
 * declares it for a config obtained some other way. Declarations are never removed. A value shorter
 * than eight characters is not scrubbed by value, so a short variable can never wipe unrelated text.
 * Use this on any text a surface returns to a caller that did not itself generate that text, such
 * as a file path, a config value, or an upstream error message, so a key value already present in
 * the environment or written by a user can never reach an agent, a browser tab, or a log line.
 *
 * @param text - The text to scrub.
 * @returns The same text with every matching key shape and configured key value replaced by
 * `[REDACTED]`.
 *
 * @example
 * ```ts
 * import { redact } from "@verbatra/sdk";
 *
 * redact(`key is ${process.env.OPENAI_API_KEY} in the log`);
 * // "key is [REDACTED] in the log" while OPENAI_API_KEY holds a key; a token shaped like
 * // sk-proj-… is redacted by its shape even when no variable holds it
 * ```
 */
export function redact(text: string): string {
  return redactKeys(text);
}

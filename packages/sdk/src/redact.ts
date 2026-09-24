import { redactKeys } from "@verbatra/ai-providers";

/**
 * Scrubs provider API key shapes and any currently configured provider environment variable value
 * out of a string, replacing each match with `[REDACTED]`.
 *
 * Two independent passes run: a set of shape patterns for the major providers (an `sk-` token
 * that does not directly follow a letter or digit, where a JSON escape such as `\n` or `\u0007` in
 * serialized text counts as a boundary, and that either starts with a known OpenAI or Anthropic key
 * prefix, `sk-ant-`, `sk-proj-`, `sk-svcacct-`, or `sk-admin-`, followed by at least 20 letters and
 * digits, or holds at least 32 letters and digits across its `-` and `_` segments, so a Slovak
 * `sk-SK` locale path or a short key such as `sk-banner_headline` or `sk-admin-panel_title` stays
 * readable while a long camelCase key such as `sk-onboardingWelcomeScreenPrimaryButton` is redacted;
 * Gemini-style `AIza` keys; a DeepL free key's hex UUID with its `:fx`
 * suffix anywhere; and a bare hex UUID only in a key context, a `DeepL-Auth-Key` header or an
 * `auth_key`, `authKey`, `auth-key`, `api_key`, `deeplKey`, `DEEPL_API_KEY`, or `DEEPL_AUTH_KEY`
 * name followed by `:`, `=`, URL-encoded `%3D`, or whitespace, quoted or with JSON-escaped quotes,
 * so an unrelated UUID in a path or an id stays readable), and an exact-value scrub, in raw and in
 * JSON-escaped form, of whatever `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
 * `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`, or `OPENAI_COMPATIBLE_API_KEY` currently holds in
 * the process environment, plus any variable declared as a key source: the one an
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
 * redact("key is sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z in the log");
 * // "key is [REDACTED] in the log"
 * ```
 */
export function redact(text: string): string {
  return redactKeys(text);
}

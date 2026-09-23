import type { AuthoringConfig, AuthoringConfigFor } from "./authoring.js";
import type { VerbatraConfigInput } from "./schema.js";

/**
 * Types a `verbatra.config.ts` while you author it. The call is a pure identity function at
 * runtime: its only job is to give your editor the type of the config object so that keys are
 * completed, unknown keys are rejected, and the model name is checked against the models the
 * selected provider actually offers.
 *
 * This overload narrows to the Anthropic provider, so `provider.options.model` completes to the
 * Claude model IDs and rejects a model belonging to another vendor.
 *
 * Validation at load time is a separate step: {@link loadConfig} still parses the file against
 * {@link verbatraConfigSchema}, so a config that type-checks can still fail validation.
 *
 * @param config - The config object, narrowed to the Anthropic provider.
 * @returns The same object, typed as {@link VerbatraConfigInput}.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@verbatra/sdk";
 *
 * export default defineConfig({
 *   sourceLocale: "en",
 *   targetLocales: ["de", "fr"],
 *   format: "i18next-json",
 *   files: { pattern: "locales/{locale}/common.json" },
 *   provider: {
 *     id: "anthropic",
 *     options: { model: "claude-sonnet-4-6", maxTokens: 4096 },
 *   },
 * });
 * ```
 */
export function defineConfig(config: AuthoringConfigFor<"anthropic">): VerbatraConfigInput;
/**
 * Types a `verbatra.config.ts` narrowed to the OpenAI provider, so `provider.options.model`
 * completes to the OpenAI chat model IDs.
 *
 * @param config - The config object, narrowed to the OpenAI provider.
 * @returns The same object, typed as {@link VerbatraConfigInput}.
 */
export function defineConfig(config: AuthoringConfigFor<"openai">): VerbatraConfigInput;
/**
 * Types a `verbatra.config.ts` narrowed to the Gemini provider, so `provider.options.model`
 * completes to the Gemini model IDs.
 *
 * @param config - The config object, narrowed to the Gemini provider.
 * @returns The same object, typed as {@link VerbatraConfigInput}.
 */
export function defineConfig(config: AuthoringConfigFor<"gemini">): VerbatraConfigInput;
/**
 * Types a `verbatra.config.ts` narrowed to the DeepL provider. DeepL is a machine-translation API
 * rather than a language model, so its options carry an optional glossary ID instead of a model.
 *
 * @param config - The config object, narrowed to the DeepL provider.
 * @returns The same object, typed as {@link VerbatraConfigInput}.
 */
export function defineConfig(config: AuthoringConfigFor<"deepl">): VerbatraConfigInput;
/**
 * Types a `verbatra.config.ts` narrowed to the Google Cloud Translation provider. Like DeepL, it is
 * a machine-translation API rather than a language model, so its options carry no model field.
 *
 * @param config - The config object, narrowed to the Google Cloud Translation provider.
 * @returns The same object, typed as {@link VerbatraConfigInput}.
 */
export function defineConfig(config: AuthoringConfigFor<"google-translate">): VerbatraConfigInput;
/**
 * Types a `verbatra.config.ts` for any supported provider. This is the fallback overload, and the
 * one that serves `openai-compatible`, where the model is a free-form string because the endpoint
 * is a local or self-hosted server whose model list the SDK cannot know.
 *
 * @param config - The config object, for any provider.
 * @returns The same object, typed as {@link VerbatraConfigInput}.
 */
export function defineConfig(config: AuthoringConfig): VerbatraConfigInput;
export function defineConfig(config: AuthoringConfig): VerbatraConfigInput {
  return config;
}

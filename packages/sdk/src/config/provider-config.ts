import {
  anthropicConfigSchema,
  createAnthropicProvider,
  createDeepLProvider,
  createGeminiProvider,
  createGoogleTranslateProvider,
  createOpenAiCompatibleProvider,
  createOpenAiProvider,
  deepLConfigSchema,
  geminiConfigSchema,
  googleTranslateConfigSchema,
  openAiCompatibleConfigSchema,
  openAiConfigSchema,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import { z } from "zod";

/**
 * The zod schema for the `provider` block, discriminated on `id`. Each variant's options are
 * validated strictly, so an option that belongs to a different provider is reported as an error
 * rather than ignored. It is embedded in {@link verbatraConfigSchema} and produces
 * {@link ProviderConfig}.
 */
export const providerConfigSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("anthropic"), options: anthropicConfigSchema.strict() }),
  z.object({ id: z.literal("openai"), options: openAiConfigSchema.strict() }),
  z.object({ id: z.literal("gemini"), options: geminiConfigSchema.strict() }),
  z.object({ id: z.literal("deepl"), options: deepLConfigSchema.strict() }),
  z.object({
    id: z.literal("google-translate"),
    options: googleTranslateConfigSchema.strict(),
  }),
  z.object({
    id: z.literal("openai-compatible"),
    options: openAiCompatibleConfigSchema.strict(),
  }),
]);

/**
 * The `provider` block of a verbatra config: a discriminated union on `id`, so each provider
 * carries exactly the options it supports and nothing else.
 *
 * No variant has a field for an API key. Keys are read from the environment by the provider itself
 * (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPL_API_KEY`, or
 * `GOOGLE_TRANSLATE_API_KEY`), which is what keeps them out of config files and out of version
 * control. The `openai-compatible` variant may name a different environment variable through
 * `apiKeyEnvVar`, but still never holds the key itself.
 */
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/**
 * The identifier of a supported translation provider: `anthropic`, `openai`, `gemini`, `deepl`,
 * `google-translate`, or `openai-compatible`. The last one targets a local or self-hosted server
 * that speaks the OpenAI chat-completions API.
 */
export type ProviderId = ProviderConfig["id"];

type ProviderFactories = {
  [K in ProviderId]: (
    options: Extract<ProviderConfig, { id: K }>["options"],
  ) => TranslationProvider;
};

const providerFactories: ProviderFactories = {
  anthropic: (options) => createAnthropicProvider(options),
  openai: (options) => createOpenAiProvider(options),
  gemini: (options) => createGeminiProvider(options),
  deepl: (options) => createDeepLProvider(options),
  "google-translate": (options) => createGoogleTranslateProvider(options),
  "openai-compatible": (options) => createOpenAiCompatibleProvider(options),
};

export const PROVIDER_IDS = Object.keys(providerFactories) as readonly ProviderId[];

export function hasProviderFactory(id: string): boolean {
  return Object.hasOwn(providerFactories, id);
}

export function buildProvider(config: ProviderConfig): TranslationProvider {
  const create = providerFactories[config.id] as (
    options: ProviderConfig["options"],
  ) => TranslationProvider;
  return create(config.options);
}

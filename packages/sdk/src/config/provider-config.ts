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
import { SdkError } from "../errors.js";

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
  z.strictObject({ id: z.literal("none"), options: z.strictObject({}).default({}) }),
]);

/**
 * The `provider` block of a verbatra config: a discriminated union on `id`, so each provider
 * carries exactly the options it supports and nothing else.
 *
 * No variant has a field for an API key. Keys are read from the environment by the provider itself
 * (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPL_API_KEY`, or
 * `GOOGLE_TRANSLATE_API_KEY`), which is what keeps them out of config files and out of version
 * control. The `openai-compatible` variant reads `OPENAI_COMPATIBLE_API_KEY` when it is set and
 * sends no real key otherwise, since a local server usually needs none; naming a different variable
 * through `apiKeyEnvVar` makes that variable required. It still never holds the key itself.
 *
 * The `none` variant disables machine translation by policy. Its `options` is always an empty
 * object, filled in when omitted, so `provider.options` exists on every variant: no provider is
 * ever constructed and no API key is read. {@link translate} and {@link watch} then fill only from
 * the translation memory and report every other key as `unfilled`, and {@link retranslateEntry}
 * fails with `MACHINE_TRANSLATION_DISABLED`.
 */
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/**
 * The `provider` block as written, before parsing: the same as {@link ProviderConfig} except that
 * a `none` provider may leave out `options`.
 */
export type ProviderConfigInput = z.input<typeof providerConfigSchema>;

/**
 * The identifier of a supported translation provider: `anthropic`, `openai`, `gemini`, `deepl`,
 * `google-translate`, `openai-compatible`, or `none`. `openai-compatible` targets a local or
 * self-hosted server that speaks the OpenAI chat-completions API; `none` disables machine
 * translation altogether.
 */
export type ProviderId = ProviderConfig["id"];

export type MachineProviderConfig = Exclude<ProviderConfig, { readonly id: "none" }>;

export type MachineProviderId = MachineProviderConfig["id"];

type ProviderFactories = {
  [K in MachineProviderId]: (
    options: Extract<MachineProviderConfig, { id: K }>["options"],
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

export const PROVIDER_IDS = Object.keys(providerFactories) as readonly MachineProviderId[];

export function hasProviderFactory(id: string): boolean {
  return Object.hasOwn(providerFactories, id);
}

export function isMachineProvider(config: ProviderConfig): config is MachineProviderConfig {
  return config.id !== "none";
}

export function machineTranslationDisabledError(action: string): SdkError {
  return new SdkError(
    "MACHINE_TRANSLATION_DISABLED",
    `Machine translation is disabled by policy (provider "none"), so ${action} is refused. ` +
      "Translate the key by hand, for instance through export and import, or configure a " +
      "translation provider.",
  );
}

export function buildProvider(config: ProviderConfig): TranslationProvider {
  if (!isMachineProvider(config)) {
    throw machineTranslationDisabledError("constructing a translation provider");
  }
  const create = providerFactories[config.id] as (
    options: MachineProviderConfig["options"],
  ) => TranslationProvider;
  return create(config.options);
}

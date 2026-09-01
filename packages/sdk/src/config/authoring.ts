import type { AnthropicModel, GeminiModel, OpenAiModel } from "@verbatra/ai-providers";
import type { ProviderConfig, ProviderId } from "./provider-config.js";
import type { VerbatraConfigInput } from "./schema.js";

/**
 * Reduces a model union to its literal members, discarding the bare `string` member that some
 * vendor SDKs include to stay open to unreleased models. Without this, `string` would absorb the
 * literals and the editor would offer no completions at all.
 */
type KnownModels<M extends string> = M extends string ? (string extends M ? never : M) : never;

/**
 * One provider's config variant with its `model` field narrowed from `string` to that vendor's
 * known model IDs, which is what turns model names into an autocompleted, checked union while
 * authoring.
 */
type AuthoringVariant<Id extends ProviderId, M extends string> =
  Extract<ProviderConfig, { id: Id }> extends infer Variant
    ? Variant extends { options: { model: string } }
      ? Omit<Variant, "options"> & {
          options: Omit<Variant["options"], "model"> & { model: KnownModels<M> };
        }
      : never
    : never;

/**
 * Maps each provider ID to its authoring-time config variant. The three language-model providers
 * get narrowed model unions; DeepL and Google Cloud Translation have no model to narrow, and
 * `openai-compatible` deliberately keeps a free-form model string because the endpoint is a local
 * or self-hosted server whose model list the SDK cannot know ahead of time.
 */
type AuthoringProviderVariant = {
  /** Anthropic, with `model` narrowed to the Claude model IDs. */
  anthropic: AuthoringVariant<"anthropic", AnthropicModel>;
  /** OpenAI, with `model` narrowed to the OpenAI chat model IDs. */
  openai: AuthoringVariant<"openai", OpenAiModel>;
  /** Gemini, with `model` narrowed to the Gemini model IDs. */
  gemini: AuthoringVariant<"gemini", GeminiModel>;
  /** DeepL, which takes no model because it is a machine-translation API rather than a language model. */
  deepl: Extract<ProviderConfig, { id: "deepl" }>;
  /**
   * Google Cloud Translation (Basic, v2), which takes no model for the same reason as DeepL: it is
   * a machine-translation API rather than a language model.
   */
  "google-translate": Extract<ProviderConfig, { id: "google-translate" }>;
  /** A local or self-hosted OpenAI-compatible endpoint, whose model stays a free-form string. */
  "openai-compatible": Extract<ProviderConfig, { id: "openai-compatible" }>;
};

/**
 * A config as authored for one specific provider: the ordinary {@link VerbatraConfigInput} shape,
 * but with `provider` narrowed to that provider's variant so its model IDs autocomplete and a model
 * belonging to another vendor is a type error.
 *
 * This is the parameter type of each {@link defineConfig} overload.
 */
export type AuthoringConfigFor<TId extends ProviderId = ProviderId> = Omit<
  VerbatraConfigInput,
  "provider"
> & {
  /** The provider block, narrowed to the variant for `TId`. */
  provider: AuthoringProviderVariant[TId];
};

/**
 * A config authored for any supported provider: {@link AuthoringConfigFor} left un-narrowed, which
 * is the type of the fallback {@link defineConfig} overload.
 */
export type AuthoringConfig = AuthoringConfigFor;

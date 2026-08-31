import { PROVIDER_ENV, SCAFFOLD_MODELS, SCAFFOLD_TOKEN_LIMIT_KEYS } from "@verbatra/ai-providers";
import { SUPPORTED_FORMATS } from "@verbatra/core";
import type { ProviderId } from "./config/provider-config.js";

/**
 * A provider that project scaffolding can offer out of the box. It excludes `openai-compatible`,
 * which needs a `baseUrl` and a model name that only the user can supply, so there is nothing
 * sensible to prefill.
 */
export type ScaffoldableProviderId = Exclude<ProviderId, "openai-compatible">;

const _envCoversAllProviders: Record<ScaffoldableProviderId, string> = PROVIDER_ENV;
void _envCoversAllProviders;

type ModelProviderId = Exclude<ScaffoldableProviderId, "deepl" | "google-translate">;

const _tokenLimitKeysCoverAllModelProviders: Record<ModelProviderId, string> =
  SCAFFOLD_TOKEN_LIMIT_KEYS;
void _tokenLimitKeysCoverAllModelProviders;

/**
 * The facts a project generator needs to write a first config: which environment variable each
 * provider reads its API key from, a sensible starting model per provider, and the formats the SDK
 * can handle.
 *
 * It is exported so that the CLI's `init` command and any third-party generator prompt with the
 * same values the SDK actually enforces, rather than keeping a copy that drifts. Note the key names
 * only: no key value is present or reachable here.
 */
export const scaffoldingMetadata = {
  /** The environment variable each scaffoldable provider reads its API key from. */
  providerEnv: PROVIDER_ENV,
  /**
   * A reasonable default model to prefill per language-model provider. DeepL and Google Cloud
   * Translation have none, since neither takes a model.
   */
  scaffoldModels: SCAFFOLD_MODELS,
  /**
   * The option key each language-model provider takes its output token limit under, since they do
   * not agree: Anthropic calls it `maxTokens` and the others `maxOutputTokens`. A generator that
   * prefills a token limit must read the key from here rather than assume one, because
   * {@link verbatraConfigSchema} validates each provider's options strictly and rejects the wrong
   * one. DeepL and Google Cloud Translation have no entry, since neither takes a token limit.
   */
  providerTokenLimitKeys: SCAFFOLD_TOKEN_LIMIT_KEYS,
  /** Every i18n file format the SDK can read and write. */
  supportedFormats: SUPPORTED_FORMATS,
} as const;

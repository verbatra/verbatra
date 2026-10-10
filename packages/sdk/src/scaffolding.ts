import {
  LIBRETRANSLATE_ENV_VAR,
  OPENAI_COMPATIBLE_ENV_VAR,
  PROVIDER_ENV,
  SCAFFOLD_MODELS,
  SCAFFOLD_TOKEN_LIMIT_KEYS,
} from "@verbatra/ai-providers";
import { SUPPORTED_FORMATS } from "@verbatra/core";
import { CONFIG_SEARCH_PLACES } from "./config/load-config.js";
import type { ProviderId } from "./config/provider-config.js";

/**
 * A translation provider that project scaffolding can offer with nothing but its id, each with an
 * API key variable in {@link scaffoldingMetadata}. It excludes `openai-compatible`, which needs a
 * `baseUrl` and a model name that only the user can supply and whose key variable is optional and
 * configurable (see `openAiCompatibleKeyEnv`), `libretranslate`, which needs the `baseUrl` of a
 * self-hosted server and whose key variable is optional (see `libreTranslateKeyEnv`), and `none`,
 * which disables machine translation and so reads no API key at all.
 */
export type ScaffoldableProviderId = Exclude<
  ProviderId,
  "openai-compatible" | "libretranslate" | "none"
>;

const _envCoversAllProviders: Record<ScaffoldableProviderId, string> = PROVIDER_ENV;
void _envCoversAllProviders;

type ModelProviderId = Exclude<ScaffoldableProviderId, "deepl" | "google-translate">;

const _tokenLimitKeysCoverAllModelProviders: Record<ModelProviderId, string> =
  SCAFFOLD_TOKEN_LIMIT_KEYS;
void _tokenLimitKeysCoverAllModelProviders;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * The facts a project generator needs to write a first config: which environment variable each
 * provider reads its API key from, a sensible starting model per provider, and the formats the SDK
 * can handle.
 *
 * It is exported so that the CLI's `init` command and any third-party generator prompt with the
 * same values the SDK actually enforces, rather than keeping a copy that drifts. Note the key names
 * only: no key value is present or reachable here. The object and every table in it are frozen, so
 * a caller cannot change what another caller, or the SDK itself, reads.
 */
export const scaffoldingMetadata = deepFreeze(
  structuredClone({
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
    /**
     * Every built-in i18n file format the SDK can read and write. A `custom:` format is never listed,
     * since its adapter ships outside verbatra.
     */
    supportedFormats: SUPPORTED_FORMATS,
    /**
     * The provider id that disables machine translation by policy, for a generator that offers a
     * human-only project. It reads no API key, so it has no entry in `providerEnv`, and its
     * provider block takes no options.
     */
    humanOnlyProviderId: "none" satisfies ProviderId,
    /**
     * The environment variable an `openai-compatible` provider reads its key from when its options
     * name no `apiKeyEnvVar`. A local server that needs no key can leave it unset.
     */
    openAiCompatibleKeyEnv: OPENAI_COMPATIBLE_ENV_VAR,
    /**
     * The environment variable a `libretranslate` provider reads its key from. It is optional: a
     * server started without `--api-keys` needs none, so a generator should leave it unset.
     */
    libreTranslateKeyEnv: LIBRETRANSLATE_ENV_VAR,
    /**
     * Every file name, relative to the project directory, that {@link loadConfig} searches for a
     * config, in the order it checks them. `package.json` counts only when it has a `verbatra`
     * property. A generator that writes `verbatra.config.ts` should refuse when another of these
     * already exists, since the one found first wins.
     */
    configSearchPlaces: CONFIG_SEARCH_PLACES as readonly string[],
  } as const),
);

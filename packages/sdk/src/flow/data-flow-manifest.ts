import {
  NETWORK_POLICY_MODES,
  type NetworkRule,
  type NetworkRuleSource,
} from "@verbatra/ai-providers";
import { z } from "zod";
import type { ProviderId } from "../config/provider-config.js";
import type { DataFlowApiKey, DataFlowField } from "../config/provider-data-flow.js";

/** The {@link DataFlowManifest.version} this build writes. A renamed or removed field raises it. */
export const DATA_FLOW_MANIFEST_VERSION = 1;

/** Whether the provider is a prompt-driven LLM, a machine-translation API, or `none`. */
export type DataFlowProviderKind = "llm" | "machine-translation" | "none";

/** The configured provider. */
export interface DataFlowProvider {
  /** The configured `provider.id`. */
  readonly id: ProviderId;
  /** What kind of provider it is; `none` sends nothing anywhere. */
  readonly kind: DataFlowProviderKind;
  /** The configured model name, for an LLM provider. */
  readonly model?: string | undefined;
}

/**
 * The effective network policy, from the config's `network` block and `VERBATRA_NETWORK_POLICY`.
 * `invalid` when either network environment variable holds a value verbatra rejects, in which case
 * every run refuses to start and `error` says why.
 */
export type DataFlowNetwork =
  | {
      /** The policy resolved. */
      readonly status: "resolved";
      /** True when at least one rule restricts the hosts a provider may connect to. */
      readonly restricted: boolean;
      /** One rule per source that sets one; a host must satisfy every rule. */
      readonly rules: readonly NetworkRule[];
    }
  | {
      /** A network environment variable holds an invalid value. */
      readonly status: "invalid";
      /** The validation message, naming the variable. */
      readonly error: string;
    };

/**
 * The network policy's verdict on a destination host.
 *
 * - `permitted`: the policy lets a request reach the host.
 * - `deferred`: the host is a name the policy can only judge by what it resolves to, which is
 *   checked before each request.
 * - `refused`: the policy refuses the host, so translate, watch and retranslate stop before any
 *   request.
 * - `invalid-policy`: the policy itself could not be resolved, see {@link DataFlowNetwork}.
 */
export type DataFlowVerdict = "permitted" | "deferred" | "refused" | "invalid-policy";

/** A proxy a destination's requests travel through, from a proxy environment variable. */
export interface DataFlowProxy {
  /** The environment variable that sets it, such as `HTTPS_PROXY`. */
  readonly variable: string;
  /** The proxy's host name or address only, never its credentials, or `(unparseable URL)`. */
  readonly host: string;
}

/** One host the provider sends requests to. */
export interface DataFlowDestination {
  /** The host name or address, never a full URL, so no credential in a URL is repeated. */
  readonly host: string;
  /**
   * Where the host comes from: the provider's built-in endpoint, the config's
   * `provider.options.baseUrl`, or a `*_BASE_URL` environment variable.
   */
  readonly source: "default" | "config" | "environment";
  /** The config key or environment variable that set the host, absent for a built-in one. */
  readonly setBy?: string | undefined;
  /**
   * For a provider whose host depends on the kind of API key, which key selects this host: DeepL
   * sends a `free-key` (one ending in `:fx`) to `api-free.deepl.com` and a `paid-key` to
   * `api.deepl.com`. Both are listed, so the key is never read to choose.
   */
  readonly when?: "free-key" | "paid-key" | undefined;
  /**
   * When a restrictive network policy is enforced for this host: before every request and
   * redirect, or only once before the provider is built (DeepL's client).
   */
  readonly policyCheck: "per-request" | "before-construction";
  /** The network policy's verdict on the host. */
  readonly verdict: DataFlowVerdict;
  /** Why the host is refused, present only for `refused`. */
  readonly reason?: string | undefined;
  /**
   * The proxies its requests go through, empty when none is in effect. A `fetch`-based provider
   * uses one only when Node's environment proxy is switched on (`NODE_USE_ENV_PROXY=1` or
   * `--use-env-proxy`); DeepL's client always honours the proxy variables.
   */
  readonly proxies: readonly DataFlowProxy[];
}

/** Project-specific counts, read from the source locale file. */
export interface DataFlowCounts {
  /** Keys in the source locale file. A run sends only the ones missing or changed in a target. */
  readonly sourceKeys: number;
  /** Source keys that carry a description or a meaning. */
  readonly keysWithContext: number;
  /**
   * Of the source keys, those whose placeholders this provider cannot mask, so it never receives
   * them. A static estimate, present only for DeepL, Google Cloud Translation and LibreTranslate: a
   * run sends only missing or changed keys, may withhold more under `sensitiveData: redact` or
   * `block`, and withholds a value whose markers do not come back intact.
   */
  readonly keysWithheld?: number | undefined;
}

/** What a provider request carries. */
export interface DataFlowSent {
  /** True only for the provider `none`, which sends nothing anywhere. */
  readonly nothing: boolean;
  /**
   * Every kind of data a request can carry with this config, empty for `none`. Never a key value.
   * Narrowed to the config: `tone` and `formality` only with a `tone` (DeepL's `formality` only
   * with `formal` or `informal`), `glossary-terms` only when the glossary applies to a target
   * locale, and `glossary-id` only with `provider.options.glossaryId`.
   */
  readonly fields: readonly DataFlowField[];
  /**
   * Whether requests carry the API key read from the environment: `required`, `optional` (sent only
   * when its variable is set), or `none`.
   */
  readonly apiKey: DataFlowApiKey | "none";
  /**
   * How placeholders reach the provider: `as-written` inside the text for an LLM, `masked` as
   * numbered markers (a value whose placeholders cannot be masked is withheld), or `none`.
   */
  readonly placeholders: "as-written" | "masked" | "none";
  /** The configured `sensitiveData.mode`, `off` when the block is absent. */
  readonly sensitiveData: "off" | "warn" | "block" | "redact";
  /** Counts from the source locale file, absent when it could not be read. */
  readonly counts?: DataFlowCounts | undefined;
  /** Why {@link DataFlowSent.counts} is absent. */
  readonly countsUnavailable?: string | undefined;
}

/** What one target locale's requests carry. */
export interface DataFlowLocale {
  /** The configured target locale. */
  readonly locale: string;
  /** The code the provider receives for it. */
  readonly codeSent: string;
  /** True when `provider.options.localeMap` set {@link DataFlowLocale.codeSent}. */
  readonly mapped: boolean;
  /**
   * Glossary terms sent with this locale's requests, counted as the request payload carries them:
   * each term with a translation, forbidden renderings or notes once, plus each term kept
   * untranslated. Before `sensitiveData: block` or `redact` drops a matching term.
   */
  readonly glossaryTermsSent: number;
}

/** One file or directory verbatra writes on the local disk. */
export interface DataFlowLocalFile {
  /** Which file: the lock file, the provenance file, the translation memory, or the local state directory. */
  readonly id: "lock" | "provenance" | "cache" | "local-state";
  /** The project-relative path it is written to, with `/` separators. */
  readonly path: string;
  /** Whether it holds source text, or text derived from it. */
  readonly holdsSourceText: boolean;
  /** Whether it holds translated text. */
  readonly holdsTranslations: boolean;
  /**
   * Whether it holds personal data: the provenance file names each reviewer, and the local state
   * directory holds a write lock for each run in progress, recording the host name of the machine
   * and the process ID until the run releases it.
   */
  readonly holdsPersonalData: boolean;
  /** Whether `verbatra init` adds it to `.gitignore`. */
  readonly gitignoredByInit: boolean;
}

/** A request outside translation itself. */
export interface DataFlowOtherRequest {
  /**
   * `language-list`: `verbatra doctor --live` fetches the provider's language list, with no
   * strings. `dns-lookup`: the system resolver looks up each destination host.
   */
  readonly id: "language-list" | "dns-lookup";
  /** What triggers it. */
  readonly trigger: string;
  /** True when the request carries the API key. */
  readonly sendsApiKey: boolean;
}

/** A surface that hands project strings to a connected AI agent. */
export interface DataFlowAgentSurface {
  /** `mcp` for `verbatra mcp`, `studio-agent-tools` for Studio's `--expose-agent-tools`. */
  readonly id: "mcp" | "studio-agent-tools";
  /** The command that starts it. */
  readonly trigger: string;
  /** Whether its read tools return values that can be redacted (`verbatra mcp --redact-values`). */
  readonly redactable: boolean;
}

/**
 * A machine-readable statement of where a project's data goes, for one loaded config: the provider,
 * the hosts it connects to and the network policy's verdict on each, what its requests carry, the
 * code each target locale is sent as, the files written locally, other requests, and the surfaces
 * that hand strings to an AI agent. It names hosts, data categories and conditions, never an API
 * key value or file contents. {@link dataFlowManifestSchema} validates it.
 */
export interface DataFlowManifest {
  /** The manifest format version, {@link DATA_FLOW_MANIFEST_VERSION}. */
  readonly version: 1;
  /** The configured provider. */
  readonly provider: DataFlowProvider;
  /** The effective network policy. */
  readonly network: DataFlowNetwork;
  /** Every host translation requests go to; empty for `none`. */
  readonly destinations: readonly DataFlowDestination[];
  /** What translation requests carry. */
  readonly sent: DataFlowSent;
  /** What each target locale's requests carry; empty for `none`. */
  readonly locales: readonly DataFlowLocale[];
  /** The files verbatra writes locally. */
  readonly local: readonly DataFlowLocalFile[];
  /** Requests outside translation; empty for `none`. */
  readonly otherRequests: readonly DataFlowOtherRequest[];
  /** The surfaces that return project strings to a connected AI agent. */
  readonly agents: readonly DataFlowAgentSurface[];
}

export const DATA_FLOW_FIELDS = [
  "key-name",
  "source-text",
  "description",
  "meaning",
  "placeholder-markers",
  "language-codes",
  "language-names",
  "tone",
  "formality",
  "glossary-terms",
  "glossary-id",
  "plural-categories",
  "instructions",
  "model",
  "output-token-limit",
] as const satisfies readonly DataFlowField[];

export const MANIFEST_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "gemini",
  "deepl",
  "google-translate",
  "openai-compatible",
  "libretranslate",
  "none",
] as const satisfies readonly ProviderId[];

export const NETWORK_RULE_SOURCES = [
  "config",
  "environment",
] as const satisfies readonly NetworkRuleSource[];

const count = z.number().int().nonnegative();

const dataFlowManifestObjectSchema = z.looseObject({
  version: z.literal(DATA_FLOW_MANIFEST_VERSION),
  provider: z.looseObject({
    id: z.enum(MANIFEST_PROVIDER_IDS),
    kind: z.enum(["llm", "machine-translation", "none"]),
    model: z.string().optional(),
  }),
  network: z.discriminatedUnion("status", [
    z.looseObject({
      status: z.literal("resolved"),
      restricted: z.boolean(),
      rules: z.array(
        z.looseObject({
          source: z.enum(NETWORK_RULE_SOURCES),
          policy: z.enum(NETWORK_POLICY_MODES),
          allowedHosts: z.array(z.string()),
        }),
      ),
    }),
    z.looseObject({ status: z.literal("invalid"), error: z.string() }),
  ]),
  destinations: z.array(
    z.looseObject({
      host: z.string().min(1),
      source: z.enum(["default", "config", "environment"]),
      setBy: z.string().optional(),
      when: z.enum(["free-key", "paid-key"]).optional(),
      policyCheck: z.enum(["per-request", "before-construction"]),
      verdict: z.enum(["permitted", "deferred", "refused", "invalid-policy"]),
      reason: z.string().optional(),
      proxies: z.array(z.looseObject({ variable: z.string().min(1), host: z.string().min(1) })),
    }),
  ),
  sent: z.looseObject({
    nothing: z.boolean(),
    fields: z.array(z.enum(DATA_FLOW_FIELDS)),
    apiKey: z.enum(["required", "optional", "none"]),
    placeholders: z.enum(["as-written", "masked", "none"]),
    sensitiveData: z.enum(["off", "warn", "block", "redact"]),
    counts: z
      .looseObject({
        sourceKeys: count,
        keysWithContext: count,
        keysWithheld: count.optional(),
      })
      .optional(),
    countsUnavailable: z.string().optional(),
  }),
  locales: z.array(
    z.looseObject({
      locale: z.string().min(1),
      codeSent: z.string().min(1),
      mapped: z.boolean(),
      glossaryTermsSent: count,
    }),
  ),
  local: z.array(
    z.looseObject({
      id: z.enum(["lock", "provenance", "cache", "local-state"]),
      path: z.string().min(1),
      holdsSourceText: z.boolean(),
      holdsTranslations: z.boolean(),
      holdsPersonalData: z.boolean(),
      gitignoredByInit: z.boolean(),
    }),
  ),
  otherRequests: z.array(
    z.looseObject({
      id: z.enum(["language-list", "dns-lookup"]),
      trigger: z.string().min(1),
      sendsApiKey: z.boolean(),
    }),
  ),
  agents: z.array(
    z.looseObject({
      id: z.enum(["mcp", "studio-agent-tools"]),
      trigger: z.string().min(1),
      redactable: z.boolean(),
    }),
  ),
});

/**
 * The zod schema for a {@link DataFlowManifest}, as `verbatra doctor --data-flow --json` prints it
 * under `result.dataFlow` and {@link dataFlow} returns it. Unknown fields are allowed and kept, so
 * a manifest from a newer verbatra that adds a field still parses; ignore the ones you do not know.
 */
export const dataFlowManifestSchema: z.ZodType<DataFlowManifest> = dataFlowManifestObjectSchema;

export type DataFlowManifestSchemaOutput = z.output<typeof dataFlowManifestObjectSchema>;

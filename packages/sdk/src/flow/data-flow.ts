import { dirname, relative, sep } from "node:path";
import {
  buildDataPayload,
  type EndpointCandidate,
  type EnvironmentSource,
  endpointCandidates,
  entriesWithheldByMasking,
  isMaskingProvider,
  isRestrictive,
  judgeEndpoint,
  keyEnvVarNames,
  processEnvironment,
  proxiesInEffect,
} from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { cacheFilePath } from "../cache/translation-memory.js";
import { glossaryForLocale } from "../config/glossary.js";
import {
  type LoadConfigOptions,
  type LoadedConfig,
  loadConfigWithMeta,
} from "../config/load-config.js";
import { endpointTargetOf } from "../config/network-policy.js";
import { modelOf } from "../config/provider-billing.js";
import { isMachineProvider, type MachineProviderConfig } from "../config/provider-config.js";
import {
  type DataFlowField,
  dataFlowOf,
  type ProviderDataFlow,
} from "../config/provider-data-flow.js";
import { kindOf } from "../config/provider-kind.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { lockFilePath } from "../lock/lock-file.js";
import { provenanceFilePath } from "../lock/provenance-file.js";
import { runStatusFilePath } from "../run-status/run-status-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import {
  DATA_FLOW_MANIFEST_VERSION,
  type DataFlowAgentSurface,
  type DataFlowCounts,
  type DataFlowDestination,
  type DataFlowLocale,
  type DataFlowLocalFile,
  type DataFlowManifest,
  type DataFlowNetwork,
  type DataFlowOtherRequest,
  type DataFlowProvider,
  type DataFlowProxy,
  type DataFlowSent,
} from "./data-flow-manifest.js";
import { foreignPlaceholdersOf } from "./foreign-placeholders.js";
import { assessProviderLocales } from "./locale-capabilities.js";
import { assessNetworkPolicy, type NetworkAssessment } from "./network-doctor.js";
import { readSourceResource } from "./source.js";

/** Input for {@link dataFlow}. */
export interface DataFlowInput {
  /** Directory to search the config from, and the base for every path. Defaults to the process working directory. */
  readonly cwd?: string;
  /** An explicit config file to describe, bypassing the search. */
  readonly configPath?: string;
}

/** Injectable dependencies for {@link dataFlow}. Every field has a working default. */
export interface DataFlowDeps {
  /** Format-adapter registry the source locale file is read through. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port the config loader and the source read use. Defaults to the real file system. */
  readonly fs?: SdkFs;
  /** Config loader. Defaults to {@link loadConfigWithMeta}. */
  readonly loadConfig?: (options: LoadConfigOptions) => Promise<LoadedConfig>;
}

export interface DataFlowContext {
  readonly cwd: string;
  readonly fs: SdkFs;
  readonly adapterRegistry?: AdapterRegistry | undefined;
  readonly env: EnvironmentSource;
}

const AGENT_SURFACES: readonly DataFlowAgentSurface[] = [
  { id: "mcp", trigger: "verbatra mcp", redactable: true },
  { id: "studio-agent-tools", trigger: "verbatra studio --expose-agent-tools", redactable: false },
];

const UNRESTRICTED = { rules: [] };

const UNPARSEABLE_PROXY = "(unparseable URL)";

function withoutKeys(
  env: EnvironmentSource,
  provider: VerbatraConfig["provider"],
): EnvironmentSource {
  const keys = new Set(keyEnvVarNames());
  if (provider.id === "openai-compatible" && provider.options.apiKeyEnvVar !== undefined) {
    keys.add(provider.options.apiKeyEnvVar);
  }
  return Object.fromEntries(Object.entries(env).filter(([name]) => !keys.has(name)));
}

function describeProvider(config: VerbatraConfig): DataFlowProvider {
  const provider = config.provider;
  if (!isMachineProvider(provider)) {
    return { id: provider.id, kind: "none" };
  }
  const model = modelOf(provider);
  return {
    id: provider.id,
    kind: kindOf(provider.id),
    ...(model === undefined ? {} : { model }),
  };
}

function describeNetwork(assessment: NetworkAssessment): DataFlowNetwork {
  if (assessment.kind === "invalid") {
    return { status: "invalid", error: assessment.error };
  }
  return {
    status: "resolved",
    restricted: isRestrictive(assessment.policy),
    rules: assessment.policy.rules.map((rule) => ({
      source: rule.source,
      policy: rule.policy,
      allowedHosts: [...rule.allowedHosts],
    })),
  };
}

function hostOrigin(
  provider: MachineProviderConfig,
  candidate: EndpointCandidate,
): Pick<DataFlowDestination, "source" | "setBy"> {
  if (candidate.endpoint.overriddenBy !== undefined) {
    return { source: "environment", setBy: candidate.endpoint.overriddenBy };
  }
  return provider.id === "openai-compatible" || provider.id === "libretranslate"
    ? { source: "config", setBy: "provider.options.baseUrl" }
    : { source: "default" };
}

function describeProxies(candidate: EndpointCandidate, env: EnvironmentSource): DataFlowProxy[] {
  return proxiesInEffect(candidate.endpoint.transport, env).map((proxy) => ({
    variable: proxy.variable,
    host: proxy.host ?? UNPARSEABLE_PROXY,
  }));
}

function describeDestination(
  provider: MachineProviderConfig,
  candidate: EndpointCandidate,
  assessment: NetworkAssessment,
  env: EnvironmentSource,
): DataFlowDestination {
  const policy = assessment.kind === "resolved" ? assessment.policy : UNRESTRICTED;
  const judgement = judgeEndpoint(policy, candidate.endpoint, env);
  const base = {
    host: judgement.host,
    ...hostOrigin(provider, candidate),
    ...(candidate.when === undefined ? {} : { when: candidate.when }),
    policyCheck: candidate.endpoint.transport === "axios" ? "before-construction" : "per-request",
    proxies: describeProxies(candidate, env),
  } as const;
  if (assessment.kind === "invalid") {
    return { ...base, verdict: "invalid-policy" };
  }
  if (judgement.kind === "refused") {
    return { ...base, verdict: "refused", reason: judgement.reason };
  }
  return { ...base, verdict: judgement.deferred ? "deferred" : "permitted" };
}

function describeDestinations(
  provider: MachineProviderConfig,
  assessment: NetworkAssessment,
  env: EnvironmentSource,
): readonly DataFlowDestination[] {
  return endpointCandidates(endpointTargetOf(provider), env).map((candidate) =>
    describeDestination(provider, candidate, assessment, env),
  );
}

function countEntries(
  provider: VerbatraConfig["provider"],
  entries: readonly TranslationEntry[],
  format: VerbatraConfig["format"],
): DataFlowCounts {
  const counts = {
    sourceKeys: entries.length,
    keysWithContext: entries.filter(
      (entry) => entry.description !== undefined || entry.meaning !== undefined,
    ).length,
  };
  if (!isMaskingProvider(provider.id)) {
    return counts;
  }
  const withheld = entriesWithheldByMasking(
    provider.id,
    entries,
    foreignPlaceholdersOf(entries, format),
  );
  return { ...counts, keysWithheld: withheld.length };
}

type CountsOutcome = { readonly counts: DataFlowCounts } | { readonly countsUnavailable: string };

async function readCounts(
  config: VerbatraConfig,
  context: DataFlowContext,
): Promise<CountsOutcome> {
  try {
    const adapter = selectAdapter(config.format, context.adapterRegistry, context.fs);
    const resolver = createLocalePathResolver(context.cwd, config);
    const { resource } = await readSourceResource(config, resolver, context.fs, adapter);
    return {
      counts: countEntries(config.provider, [...resource.entries.values()], adapter.format),
    };
  } catch (error) {
    return { countsUnavailable: errorMessage(error) };
  }
}

function sensitiveModeOf(config: VerbatraConfig): DataFlowSent["sensitiveData"] {
  return config.sensitiveData?.mode ?? "off";
}

function glossaryTermCount(config: VerbatraConfig, locale: string): number {
  const payload = buildDataPayload({
    sourceLocale: config.sourceLocale,
    targetLocale: locale,
    glossary: glossaryForLocale(config.glossary, locale),
    entries: [],
  });
  const termFields = ["glossary", "forbiddenTranslations", "glossaryNotes"].map(
    (field) => (payload[field] ?? {}) as Record<string, unknown>,
  );
  const terms = new Set(termFields.flatMap((field) => Object.keys(field)));
  const kept = (payload.doNotTranslate ?? []) as readonly string[];
  return terms.size + kept.length;
}

function appliesToConfig(field: DataFlowField, config: VerbatraConfig): boolean {
  switch (field) {
    case "tone":
      return config.tone !== undefined;
    case "formality":
      return config.tone === "formal" || config.tone === "informal";
    case "glossary-terms":
      return config.targetLocales.some((locale) => glossaryTermCount(config, locale) > 0);
    case "glossary-id":
      return config.provider.id === "deepl" && config.provider.options.glossaryId !== undefined;
    default:
      return true;
  }
}

function describeSent(
  config: VerbatraConfig,
  flow: ProviderDataFlow | undefined,
  counts: CountsOutcome,
): DataFlowSent {
  const common = { sensitiveData: sensitiveModeOf(config), ...counts };
  if (flow === undefined) {
    return { nothing: true, fields: [], apiKey: "none", placeholders: "none", ...common };
  }
  return {
    nothing: false,
    fields: flow.fields.filter((field) => appliesToConfig(field, config)),
    apiKey: flow.apiKey,
    placeholders: flow.fields.includes("placeholder-markers") ? "masked" : "as-written",
    ...common,
  };
}

function describeLocales(
  config: VerbatraConfig,
  provider: MachineProviderConfig,
  flow: ProviderDataFlow,
): readonly DataFlowLocale[] {
  const sendsGlossary = flow.fields.includes("glossary-terms");
  return assessProviderLocales(config, provider, config.targetLocales).locales.map((entry) => ({
    locale: entry.locale,
    codeSent: entry.providerCode,
    mapped: entry.mapped,
    glossaryTermsSent: sendsGlossary ? glossaryTermCount(config, entry.locale) : 0,
  }));
}

function projectPath(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join("/");
}

function describeLocalFiles(cwd: string): readonly DataFlowLocalFile[] {
  const files: readonly DataFlowLocalFile[] = [
    {
      id: "lock",
      path: lockFilePath(cwd),
      holdsSourceText: false,
      holdsTranslations: false,
      holdsPersonalData: false,
      gitignoredByInit: false,
    },
    {
      id: "provenance",
      path: provenanceFilePath(cwd),
      holdsSourceText: false,
      holdsTranslations: false,
      holdsPersonalData: true,
      gitignoredByInit: false,
    },
    {
      id: "cache",
      path: cacheFilePath(cwd),
      holdsSourceText: true,
      holdsTranslations: true,
      holdsPersonalData: false,
      gitignoredByInit: true,
    },
    {
      id: "local-state",
      path: dirname(runStatusFilePath(cwd)),
      holdsSourceText: true,
      holdsTranslations: false,
      holdsPersonalData: true,
      gitignoredByInit: true,
    },
  ];
  return files.map((file) => ({ ...file, path: projectPath(cwd, file.path) }));
}

function describeOtherRequests(flow: ProviderDataFlow): readonly DataFlowOtherRequest[] {
  const languageList: readonly DataFlowOtherRequest[] =
    flow.languageList === "none"
      ? []
      : [
          {
            id: "language-list",
            trigger: "verbatra doctor --live",
            sendsApiKey: flow.languageList === "with-key",
          },
        ];
  return [
    ...languageList,
    { id: "dns-lookup", trigger: "each connection to a destination host", sendsApiKey: false },
  ];
}

interface ProviderSections {
  readonly destinations: readonly DataFlowDestination[];
  readonly locales: readonly DataFlowLocale[];
  readonly otherRequests: readonly DataFlowOtherRequest[];
}

const NO_PROVIDER_SECTIONS: ProviderSections = { destinations: [], locales: [], otherRequests: [] };

function providerSections(
  config: VerbatraConfig,
  assessment: NetworkAssessment,
  env: EnvironmentSource,
): ProviderSections {
  const provider = config.provider;
  if (!isMachineProvider(provider)) {
    return NO_PROVIDER_SECTIONS;
  }
  const flow = dataFlowOf(provider.id);
  return {
    destinations: describeDestinations(provider, assessment, env),
    locales: describeLocales(config, provider, flow),
    otherRequests: describeOtherRequests(flow),
  };
}

export async function buildDataFlowManifest(
  config: VerbatraConfig,
  context: DataFlowContext,
): Promise<DataFlowManifest> {
  const provider = config.provider;
  const keyless = withoutKeys(context.env, provider);
  const assessment = assessNetworkPolicy(config.network, keyless);
  const sections = providerSections(config, assessment, keyless);
  const flow = isMachineProvider(provider) ? dataFlowOf(provider.id) : undefined;
  return {
    version: DATA_FLOW_MANIFEST_VERSION,
    provider: describeProvider(config),
    network: describeNetwork(assessment),
    destinations: sections.destinations,
    sent: describeSent(config, flow, await readCounts(config, context)),
    locales: sections.locales,
    local: describeLocalFiles(context.cwd),
    otherRequests: sections.otherRequests,
    agents: AGENT_SURFACES,
  };
}

function loadOptionsFor(input: DataFlowInput, deps: DataFlowDeps): LoadConfigOptions {
  return {
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
  };
}

/**
 * Describes where a project's data goes, for the loaded config, as a versioned
 * {@link DataFlowManifest}: the provider, every host its requests go to with the network policy's
 * verdict on it, what those requests carry, the code each target locale is sent as with its glossary
 * term count, the files written locally, the requests made outside translation, and the surfaces
 * that hand strings to a connected AI agent. Use it as evidence for a data processing or
 * non-disclosure review, or diff it in CI.
 *
 * It spends nothing and reads no API key: no provider is constructed and no network request is
 * made, and every API key variable is removed from the environment it judges endpoints against.
 * DeepL, whose host depends on whether the key ends in `:fx`, is therefore listed with both hosts.
 * The manifest names hosts, data categories and conditions, never a key value or the contents of a
 * file; the source locale file is read only to count its keys.
 *
 * A network environment variable holding an invalid value does not throw: the manifest reports it
 * in {@link DataFlowManifest.network} and gives every destination the verdict `invalid-policy`. A
 * source locale file that cannot be read leaves {@link DataFlowSent.counts} out and says why in
 * {@link DataFlowSent.countsUnavailable}. With the provider `none`, nothing is sent: the manifest
 * lists no destination, no field, no locale and no other request.
 *
 * @param input - The working directory and an optional explicit config path.
 * @param deps - Optional adapter registry, file-system, and config-loader overrides.
 * @returns The manifest, valid under {@link dataFlowManifestSchema}.
 *
 * @throws {@link SdkError} `CONFIG_NOT_FOUND`: no config was found by search, or the explicit
 * `configPath` does not exist.
 * @throws {@link SdkError} `CONFIG_INVALID`: the config could not be loaded or fails validation.
 *
 * @example
 * ```ts
 * import { dataFlow } from "@verbatra/sdk";
 *
 * const manifest = await dataFlow();
 * for (const destination of manifest.destinations) {
 *   console.log(`${destination.host}: ${destination.verdict}`);
 * }
 * ```
 */
export async function dataFlow(
  input: DataFlowInput = {},
  deps: DataFlowDeps = {},
): Promise<DataFlowManifest> {
  const load = deps.loadConfig ?? loadConfigWithMeta;
  const { config } = await load(loadOptionsFor(input, deps));
  return buildDataFlowManifest(config, {
    cwd: input.cwd ?? process.cwd(),
    fs: deps.fs ?? defaultFs,
    adapterRegistry: deps.adapterRegistry,
    env: processEnvironment(),
  });
}

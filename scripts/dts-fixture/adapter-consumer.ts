import {
  AdapterError,
  type AdapterFs,
  type AdapterRegistry,
  type AdapterResolution,
  type BoundedReadOutcome,
  type BuildWriteTree,
  type ComparePlaceholders,
  type ComputeInvalidIcuKeys,
  type CustomFormatId,
  createDefaultRegistry,
  createFlatFileAdapter,
  createTreeFileAdapter,
  type DeriveDescriptions,
  type DeriveEntry,
  defineConfig,
  type ExtractPlaceholders,
  type FlatFileAdapterOptions,
  type FlatParseResult,
  type FormatAdapter,
  type FormatId,
  isCustomFormatId,
  type JsonLeaf,
  type JsonRecord,
  type JsonTree,
  type KeyMode,
  type LocaleResource,
  loadConfig,
  nodeAdapterFs,
  type OrderedRecord,
  type OrderedValue,
  type ReadResult,
  type ResolveOptions,
  type RunSummary,
  type Sniff,
  type TranslationEntry,
  type TreeFileAdapterOptions,
  translate,
  type ValidateMessage,
  type ValidateTree,
} from "@verbatra/sdk";

const TOML_FORMAT: CustomFormatId = "custom:toml";

const tokensIn: ExtractPlaceholders = (value) =>
  [...value.matchAll(/\{[a-z]+\}/g)].map((match) => match[0]);

const looksLikeToml: Sniff = (sample) => !sample.startsWith("{");

const alwaysValid: ValidateMessage = () => true;

const noInvalidKeys: ComputeInvalidIcuKeys = () => [];

const compareWholeValues: ComparePlaceholders = () => ({
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
});

const deriveLeaf: DeriveEntry = (_key, value) => ({
  placeholders: tokensIn(value),
  isPlural: false,
});

const describeKeys: DeriveDescriptions = () => new Map<string, string>();

const rejectNothing: ValidateTree = (tree: JsonRecord): void => {
  const first: JsonTree | undefined = [...tree.values()][0];
  const leaf: JsonLeaf = typeof first === "string" ? first : null;
  if (leaf === "impossible") {
    throw new AdapterError("INVALID_STRUCTURE", "unreachable");
  }
};

const buildTree: BuildWriteTree = (): OrderedRecord => {
  const value: OrderedValue = "x";
  return new Map<string, OrderedValue>([["k", value]]);
};

const keyMode: KeyMode = "literal-leaf";

function parseFlat(content: string, namespace: string): Map<string, TranslationEntry> {
  const entries = new Map<string, TranslationEntry>();
  for (const line of content.split("\n")) {
    const [key = "", ...rest] = line.split("=");
    if (key === "") {
      continue;
    }
    const value = rest.join("=");
    entries.set(key, {
      key,
      namespace,
      value,
      placeholders: tokensIn(value),
      isPlural: false,
    });
  }
  return entries;
}

const flatOptions: FlatFileAdapterOptions = {
  format: TOML_FORMAT,
  extensions: [".toml"],
  sniff: looksLikeToml,
  parseEntries: (content, namespace): FlatParseResult => ({
    entries: parseFlat(content, namespace),
    excludedLeafPaths: [],
  }),
  serializeEntries: (entries) =>
    [...entries].map(([key, entry]) => `${key}=${entry.value}`).join("\n"),
  extractPlaceholders: tokensIn,
  validateMessage: alwaysValid,
  computeInvalidIcuKeys: noInvalidKeys,
  comparePlaceholders: compareWholeValues,
  fs: nodeAdapterFs,
};

export const flatAdapter: FormatAdapter = createFlatFileAdapter(flatOptions);

const treeOptions: TreeFileAdapterOptions = {
  format: "custom:hocon",
  extensions: [".conf"],
  parse: (): JsonRecord => new Map(),
  serialize: () => "",
  deriveEntry: deriveLeaf,
  extractPlaceholders: tokensIn,
  validateTree: rejectNothing,
  buildWriteTree: buildTree,
  deriveDescriptions: describeKeys,
  keyMode,
};

export const treeAdapter: FormatAdapter = createTreeFileAdapter(treeOptions);

export const registry: AdapterRegistry = createDefaultRegistry(nodeAdapterFs)
  .register(flatAdapter)
  .register(treeAdapter);

const resolveOptions: ResolveOptions = { format: TOML_FORMAT };

export const resolution: AdapterResolution = registry.resolve("locales/de.toml", resolveOptions);

export async function readWithAdapter(adapter: FormatAdapter): Promise<ReadResult> {
  return adapter.read("locales/de.toml", "de");
}

export async function writeWithAdapter(
  adapter: FormatAdapter,
  resource: LocaleResource,
): Promise<void> {
  await adapter.write(resource, "locales/de.toml");
}

export async function translateWithRegistry(): Promise<RunSummary> {
  const config = await loadConfig({ cwd: "." });

  return translate({ config }, { adapterRegistry: registry });
}

export function describeFailure(error: unknown): string {
  return error instanceof AdapterError ? `${error.code}: ${error.message}` : "unknown";
}

export const memoryFs: AdapterFs = {
  readBounded: (): Promise<BoundedReadOutcome> => Promise.resolve({ kind: "not-a-file" }),
  writeFileAtomic: (): Promise<void> => Promise.resolve(),
};

export const builtIn: FormatId = "i18next-json";

export const thirdParty: boolean = isCustomFormatId(TOML_FORMAT);

export const tomlConfig = defineConfig({
  sourceLocale: "en",
  targetLocales: ["de"],
  format: TOML_FORMAT,
  files: { pattern: "locales/{locale}.toml" },
  provider: { id: "deepl", options: {} },
});

defineConfig({
  sourceLocale: "en",
  targetLocales: ["de"],
  // @ts-expect-error a format that is neither a built-in nor a custom: identifier is rejected.
  format: "toml",
  files: { pattern: "locales/{locale}.toml" },
  provider: { id: "deepl", options: {} },
});

defineConfig({
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "custom:toml",
  files: { pattern: "locales/{locale}.toml" },
  provider: { id: "deepl", options: {} },
});

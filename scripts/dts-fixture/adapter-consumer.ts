import {
  AdapterError,
  type AdapterFs,
  type AdapterRegistry,
  type AdapterResolution,
  type BoundedReadOutcome,
  type CustomFormatId,
  createDefaultRegistry,
  createFlatFileAdapter,
  createTreeFileAdapter,
  defineConfig,
  type FlatFileAdapterOptions,
  type FormatAdapter,
  type FormatId,
  isCustomFormatId,
  type LocaleResource,
  nodeAdapterFs,
  type ReadResult,
  type ResolveOptions,
  type TranslationEntry,
  type TreeFileAdapterOptions,
} from "@verbatra/sdk";

const TOML_FORMAT: CustomFormatId = "custom:toml";

function tokensIn(value: string): readonly string[] {
  return [...value.matchAll(/\{[a-z]+\}/g)].map((match) => match[0]);
}

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
  sniff: (sample) => !sample.startsWith("{"),
  parseEntries: (content, namespace) => parseFlat(content, namespace),
  serializeEntries: (entries) =>
    [...entries].map(([key, entry]) => `${key}=${entry.value}`).join("\n"),
  extractPlaceholders: tokensIn,
  validateMessage: () => true,
  computeInvalidIcuKeys: () => [],
  fs: nodeAdapterFs,
};

export const flatAdapter: FormatAdapter = createFlatFileAdapter(flatOptions);

const treeOptions: TreeFileAdapterOptions = {
  format: "custom:hocon",
  extensions: [".conf"],
  parse: () => new Map(),
  serialize: () => "",
  deriveEntry: (_key, value) => ({ placeholders: tokensIn(value), isPlural: false }),
  extractPlaceholders: tokensIn,
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

import type { FormatId, LocaleResource, TranslationEntry } from "@verbatra/core";
import type { FormatAdapter, ReadResult } from "../adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import {
  buildCanHandle,
  type ComparePlaceholders,
  type ComputeInvalidIcuKeys,
  computeIcu,
  type ExtractPlaceholders,
  namespaceOf,
  rethrowStructured,
  type Sniff,
  type ValidateMessage,
  type ValidateTree,
} from "../shell.js";
import { readFileContent } from "./bounded-read.js";
import { type DeriveEntry, type FlattenResult, flattenTree, type KeyMode } from "./flatten.js";
import type { JsonRecord } from "./json-tree.js";
import type { OrderedRecord } from "./ordered-json.js";
import { unflattenEntries } from "./unflatten.js";

type BuildWriteTree = (
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
) => OrderedRecord | Promise<OrderedRecord>;

type DeriveDescriptions = (content: string) => ReadonlyMap<string, string>;

export interface TreeFileAdapterOptions {
  readonly format: FormatId;
  readonly extensions: readonly string[];
  readonly sniff?: Sniff;
  readonly parse: (content: string) => JsonRecord;
  readonly serialize: (tree: OrderedRecord) => string;
  readonly deriveEntry: DeriveEntry;
  readonly extractPlaceholders: ExtractPlaceholders;
  readonly computeInvalidIcuKeys?: ComputeInvalidIcuKeys;
  readonly validateMessage?: ValidateMessage;
  readonly validateTree?: ValidateTree;
  readonly buildWriteTree?: BuildWriteTree;
  readonly keyMode?: KeyMode;
  readonly comparePlaceholders?: ComparePlaceholders;
  readonly deriveDescriptions?: DeriveDescriptions;
  readonly fs?: AdapterFs;
}

function mergeDescriptions(
  entries: Map<string, TranslationEntry>,
  content: string,
  deriveDescriptions?: DeriveDescriptions,
): void {
  if (!deriveDescriptions) {
    return;
  }
  for (const [key, description] of deriveDescriptions(content)) {
    const entry = entries.get(key);
    if (entry !== undefined) {
      entries.set(key, { ...entry, description });
    }
  }
}

function toEntries(
  content: string,
  namespace: string,
  parse: (content: string) => JsonRecord,
  deriveEntry: DeriveEntry,
  keyMode: KeyMode,
  validateTree?: ValidateTree,
  deriveDescriptions?: DeriveDescriptions,
): FlattenResult {
  try {
    const tree = parse(content);
    validateTree?.(tree);
    const result = flattenTree(tree, namespace, deriveEntry, keyMode);
    mergeDescriptions(result.entries, content, deriveDescriptions);
    return result;
  } catch (error) {
    rethrowStructured(error, "The file could not be parsed.");
  }
}

export function createTreeFileAdapter(options: TreeFileAdapterOptions): FormatAdapter {
  const {
    format,
    extensions,
    sniff,
    parse,
    serialize,
    deriveEntry,
    extractPlaceholders,
    computeInvalidIcuKeys,
    validateMessage,
    validateTree,
    buildWriteTree,
    comparePlaceholders,
    deriveDescriptions,
    keyMode = "literal-leaf",
    fs = nodeAdapterFs,
  } = options;
  return {
    format,
    canHandle: buildCanHandle(extensions, sniff),
    extractPlaceholders,
    validateMessage: validateMessage ?? ((): boolean => true),
    ...(comparePlaceholders !== undefined ? { comparePlaceholders } : {}),
    async read(filePath, locale): Promise<ReadResult> {
      const content = await readFileContent(fs, filePath);
      const namespace = namespaceOf(filePath);
      const { entries, excludedLeafPaths } = toEntries(
        content,
        namespace,
        parse,
        deriveEntry,
        keyMode,
        validateTree,
        deriveDescriptions,
      );
      const resource: LocaleResource = { locale, namespace, format, entries };
      const invalidIcuKeys = computeIcu(entries, computeInvalidIcuKeys);
      return { resource, invalidIcuKeys, excludedLeafPaths };
    },
    async write(resource, filePath): Promise<void> {
      const tree = buildWriteTree
        ? await buildWriteTree(resource.entries, filePath, fs)
        : unflattenEntries(resource.entries);
      await fs.writeFileAtomic(filePath, serialize(tree));
    },
  };
}

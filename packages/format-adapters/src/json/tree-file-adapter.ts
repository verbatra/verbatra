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

/**
 * Builds the tree to serialize from the entries about to be written, for a format that patches an
 * existing document rather than rebuilding it from the entries alone.
 */
type BuildWriteTree = (
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
) => OrderedRecord | Promise<OrderedRecord>;

/**
 * Pulls per-key translator descriptions out of the raw file text, for a format that carries them as
 * metadata alongside the values.
 */
type DeriveDescriptions = (content: string) => ReadonlyMap<string, string>;

/** Everything {@link createTreeFileAdapter} needs to turn a nested-tree format into an adapter. */
export interface TreeFileAdapterOptions {
  /** The format this adapter claims: a built-in name, or a `custom:` identifier of your own. */
  readonly format: FormatId;
  /** The lowercase file extensions this format owns, each including the leading dot. */
  readonly extensions: readonly string[];
  /**
   * Optional content check, consulted when a sample is available, so this adapter does not claim
   * every file that merely shares one of its extensions.
   */
  readonly sniff?: Sniff;
  /** Parse one file's text into a nested tree, preserving key order at every level. */
  readonly parse: (content: string) => JsonRecord;
  /** Render a nested tree back to the format's text, preserving key order at every level. */
  readonly serialize: (tree: OrderedRecord) => string;
  /** Derive the placeholder tokens and the plural flag for one leaf. */
  readonly deriveEntry: DeriveEntry;
  /** Find this format's placeholder tokens in one value. */
  readonly extractPlaceholders: ExtractPlaceholders;
  /** Optional per-file report of the keys whose values are invalid for this format's message syntax. */
  readonly computeInvalidIcuKeys?: ComputeInvalidIcuKeys;
  /** Optional message-syntax check applied to a candidate value before it is written. */
  readonly validateMessage?: ValidateMessage;
  /** Optional structural check on the parsed tree, throwing an `AdapterError` for a shape this format forbids. */
  readonly validateTree?: ValidateTree;
  /** Optional override for how the tree to write is assembled, for a format that patches the existing document. */
  readonly buildWriteTree?: BuildWriteTree;
  /** How a dotted key is addressed. Defaults to `"literal-leaf"`. */
  readonly keyMode?: KeyMode;
  /** Optional whole-value placeholder comparison, for a format whose structure flattening would lose. */
  readonly comparePlaceholders?: ComparePlaceholders;
  /** Optional extraction of per-key translator descriptions from the raw file text. */
  readonly deriveDescriptions?: DeriveDescriptions;
  /** The file-system port to read and write through. Defaults to `nodeAdapterFs`. */
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

/**
 * Build a {@link FormatAdapter} for a nested-tree format: one whose entries live at paths through
 * nested objects, such as i18next JSON or YAML. The factory supplies the bounded read, the atomic
 * write, tree flattening and unflattening, extension detection and the structured error handling;
 * you supply only the format's own parsing, serialization and per-leaf facts.
 *
 * @param options - The format's parsing, serialization, detection and per-entry behaviour.
 * @returns A complete adapter, ready to register on an `AdapterRegistry`.
 * @throws Nothing itself. The returned adapter's `read` and `write` raise `AdapterError` for content
 *   this format cannot represent, and reject with the underlying filesystem error otherwise.
 *
 * @example
 * ```ts
 * const hoconAdapter = createTreeFileAdapter({
 *   format: "custom:hocon",
 *   extensions: [".conf"],
 *   parse: (content) => parseHocon(content),
 *   serialize: (tree) => serializeHocon(tree),
 *   deriveEntry: (_key, value) => ({ placeholders: tokensIn(value), isPlural: false }),
 *   extractPlaceholders: (value) => tokensIn(value),
 * });
 * ```
 */
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

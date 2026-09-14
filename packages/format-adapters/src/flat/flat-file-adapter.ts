import type { FormatId, LocaleResource, TranslationEntry } from "@verbatra/core";
import type { FormatAdapter, ReadResult } from "../adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { readFileContent } from "../json/bounded-read.js";
import {
  buildCanHandle,
  type ComputeInvalidIcuKeys,
  computeIcu,
  type ExtractPlaceholders,
  namespaceOf,
  rethrowStructured,
  type Sniff,
  type ValidateMessage,
} from "../shell.js";

/** Everything {@link createFlatFileAdapter} needs to turn a flat key/value format into an adapter. */
export interface FlatFileAdapterOptions {
  /** The format this adapter claims: a built-in name, or a `custom:` identifier of your own. */
  readonly format: FormatId;
  /** The lowercase file extensions this format owns, each including the leading dot. */
  readonly extensions: readonly string[];
  /**
   * Optional content check, consulted when a sample is available, so this adapter does not claim
   * every file that merely shares one of its extensions.
   */
  readonly sniff?: Sniff;
  /**
   * Parse one file's text into entries keyed by entry key, in document order. Throw an
   * `AdapterError` for content this format cannot represent; anything else thrown is reported as a
   * structural failure.
   */
  readonly parseEntries: (
    content: string,
    namespace: string,
    filePath: string,
    fs: AdapterFs,
  ) => Map<string, TranslationEntry> | Promise<Map<string, TranslationEntry>>;
  /**
   * Render entries back to the format's text, preserving key order. Receives the destination path
   * and the port, for a format that has to consult the existing file to write in place.
   */
  readonly serializeEntries: (
    entries: ReadonlyMap<string, TranslationEntry>,
    filePath: string,
    fs: AdapterFs,
  ) => Promise<string> | string;
  /** Find this format's placeholder tokens in one value. */
  readonly extractPlaceholders: ExtractPlaceholders;
  /** Optional message-syntax check applied to a candidate value before it is written. */
  readonly validateMessage?: ValidateMessage;
  /** Optional per-file report of the keys whose values are invalid for this format's message syntax. */
  readonly computeInvalidIcuKeys?: ComputeInvalidIcuKeys;
  /** The file-system port to read and write through. Defaults to `nodeAdapterFs`. */
  readonly fs?: AdapterFs;
}

async function toEntries(
  content: string,
  namespace: string,
  filePath: string,
  fs: AdapterFs,
  parseEntries: FlatFileAdapterOptions["parseEntries"],
): Promise<Map<string, TranslationEntry>> {
  try {
    return await parseEntries(content, namespace, filePath, fs);
  } catch (error) {
    rethrowStructured(error, "The file could not be parsed.");
  }
}

/**
 * Build a {@link FormatAdapter} for a flat key/value format: one where every entry is addressed by a
 * single key with no nesting, such as Java `.properties` or Android `strings.xml`. The factory
 * supplies the bounded read, the atomic write, extension detection and the structured error
 * handling; you supply only the format's own parsing and serialization.
 *
 * @param options - The format's parsing, serialization and detection behaviour.
 * @returns A complete adapter, ready to register on an `AdapterRegistry`.
 * @throws Nothing itself. The returned adapter's `read` and `write` raise `AdapterError` for content
 *   this format cannot represent, and reject with the underlying filesystem error otherwise.
 *
 * @example
 * ```ts
 * const tomlAdapter = createFlatFileAdapter({
 *   format: "custom:toml",
 *   extensions: [".toml"],
 *   parseEntries: (content, namespace) => parseToml(content, namespace),
 *   serializeEntries: (entries) => serializeToml(entries),
 *   extractPlaceholders: (value) => [...value.matchAll(/\{\w+\}/g)].map((m) => m[0]),
 * });
 * ```
 */
export function createFlatFileAdapter(options: FlatFileAdapterOptions): FormatAdapter {
  const {
    format,
    extensions,
    sniff,
    parseEntries,
    serializeEntries,
    extractPlaceholders,
    validateMessage,
    computeInvalidIcuKeys,
    fs = nodeAdapterFs,
  } = options;
  return {
    format,
    canHandle: buildCanHandle(extensions, sniff),
    extractPlaceholders,
    validateMessage: validateMessage ?? ((): boolean => true),
    async read(filePath, locale): Promise<ReadResult> {
      const content = await readFileContent(fs, filePath);
      const namespace = namespaceOf(filePath);
      const entries = await toEntries(content, namespace, filePath, fs, parseEntries);
      const resource: LocaleResource = { locale, namespace, format, entries };
      const invalidIcuKeys = computeIcu(entries, computeInvalidIcuKeys);
      return { resource, invalidIcuKeys, excludedLeafPaths: [] };
    },
    async write(resource, filePath): Promise<void> {
      const data = await serializeEntries(resource.entries, filePath, fs);
      await fs.writeFileAtomic(filePath, data);
    },
  };
}

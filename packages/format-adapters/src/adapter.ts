import type { LocaleResource, PlaceholderIntegrityResult, SupportedFormat } from "@verbatra/core";

/**
 * The result of reading a file into core's intermediate representation. The two diagnostic lists are
 * reported as data rather than thrown, so one bad leaf never fails a whole read.
 */
export interface ReadResult {
  /** The parsed locale resource. */
  readonly resource: LocaleResource;
  /**
   * Keys whose values are invalid for the format's message syntax. Empty for a format with no
   * message-syntax check, which treats every value as valid.
   */
  readonly invalidIcuKeys: readonly string[];
  /**
   * Keys or dotted paths that were present in the source but excluded from translation: a stray
   * non-string leaf (a number, boolean, or null) for a tree-based format, or a key the format's own
   * metadata marks as not translatable. These are never translated, hashed, diffed, or checked for
   * placeholder or ICU integrity. Whether one survives a later rewrite of the same file depends on
   * the adapter: an adapter that reconstructs the whole file from `resource.entries` alone drops it,
   * while an adapter that patches only the entries it touches into the existing document (for
   * example `apple-xcstrings`) preserves it verbatim. Empty for a file with no such leaves.
   */
  readonly excludedLeafPaths: readonly string[];
}

/**
 * The contract every format adapter implements. A new format attaches by implementing this interface
 * and registering it in an {@link AdapterRegistry}.
 *
 * Implement it through one of `@verbatra/format-adapters`' shared factories rather than from
 * scratch: `createTreeFileAdapter` for a nested-tree format (with `createJsonFileAdapter` as its
 * JSON specialization) and `createFlatFileAdapter` for a flat key/value format. A format that fits
 * neither shape implements this interface directly, and either way it first needs its member added
 * to core's {@link SupportedFormat}.
 */
export interface FormatAdapter {
  /** The single format this adapter handles (a {@link SupportedFormat} from core). */
  readonly format: SupportedFormat;

  /**
   * Detect whether this adapter can handle a file, by path extension and an optional content sample.
   * Best-effort and side-effect-free; it reads nothing from disk.
   *
   * @param filePath - The path of the file under consideration.
   * @param sample - An optional leading content sample to aid detection.
   * @returns True if this adapter could handle the file. Several adapters may return true for the same
   *   file (all JSON adapters claim `.json`); the caller disambiguates by explicit format.
   */
  canHandle(filePath: string, sample?: string): boolean;

  /**
   * Read a file into a {@link LocaleResource} plus its message-validity result.
   *
   * @param filePath - The file to read.
   * @param locale - The locale to tag the resource with.
   * @returns The parsed resource and the keys whose values are invalid for the format.
   * @throws `AdapterError` when the content is malformed, oversized, or structurally invalid
   *   (the implementation names the specific codes). A missing or unopenable path instead rejects with
   *   the underlying filesystem error.
   */
  read(filePath: string, locale: string): Promise<ReadResult>;

  /**
   * Write a {@link LocaleResource} back to a file, preserving key order and structure, atomically.
   *
   * @param resource - The resource to serialize.
   * @param filePath - The destination file.
   * @throws `AdapterError` if the resource cannot be represented in the format; rejects with the
   *   underlying filesystem error on a write failure.
   */
  write(resource: LocaleResource, filePath: string): Promise<void>;

  /**
   * Extract the format's placeholder tokens from a single value, resolving nothing.
   *
   * @param value - The translatable string to scan.
   * @returns The placeholder tokens found, in document order. Does not throw.
   */
  extractPlaceholders(value: string): readonly string[];

  /**
   * Validate a single value against the format's message syntax before it is written. Only the
   * ICU-message formats carry a real check today (next-intl and ARB); every other adapter has no
   * message syntax to violate and returns true for any value.
   *
   * @param value - The candidate translated value to validate.
   * @returns True when the value is valid for the format's message syntax. Does not throw; an
   *   unparseable value returns false.
   */
  validateMessage(value: string): boolean;

  /**
   * Optional whole-value placeholder comparison, used by callers instead of independently extracting
   * each side's placeholders with {@link extractPlaceholders} and diffing the flat lists. Two adapter
   * families define one, for different reasons:
   *
   * - The ICU formats (next-intl and ARB) compare branch by branch, because flattening a
   *   plural/select value loses which branch a placeholder came from.
   * - The double-brace formats (i18next, ngx-translate, and YAML) add a one-directional
   *   single-brace check on top of their flat multiset comparison: a `{name}`-shaped token present
   *   in the translated value but absent from the source is reported as `extra`. Single-brace text
   *   is ordinary literal content under these formats' default delimiters, so it is never required
   *   to survive a translation, but inventing one is never a legitimate translation either.
   *
   * Absent for the remaining adapters, which are compared via `extractPlaceholders` plus a flat
   * multiset check.
   *
   * @param sourceValue - The source value.
   * @param targetValue - The translated value to check against it.
   * @returns The merged placeholder-integrity result. Does not throw.
   */
  comparePlaceholders?(sourceValue: string, targetValue: string): PlaceholderIntegrityResult;
}

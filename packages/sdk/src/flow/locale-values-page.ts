import { type LocaleItems, pageAcrossLocales } from "../paging/page-across-locales.js";
import {
  type KeyValuePair,
  type LocaleValues,
  type LocaleValuesDeps,
  type LocaleValuesInput,
  localeValues,
} from "./locale-values.js";

/**
 * The longest `query` the verbatra MCP server and Studio agent tool accept for
 * {@link localeValuesPage}. The SDK itself takes a query of any length.
 */
export const LOCALE_VALUES_QUERY_MAX_LENGTH = 500;

/** One key's current source and target text on a {@link LocaleValuesPage}. */
export interface LocaleValuesPageEntry extends KeyValuePair {
  /** The key name. */
  readonly key: string;
}

/** One target locale's entries on a {@link LocaleValuesPage}. */
export interface LocaleValuesPageLocale {
  /** The target locale these entries were read for. */
  readonly locale: string;
  /** This locale's entries on the page, in source key order, then the target-only keys. */
  readonly entries: readonly LocaleValuesPageEntry[];
}

/** One page of current source and target text, as returned by {@link localeValuesPage}. */
export interface LocaleValuesPage {
  /** The target locales that hold at least one entry on this page, in configured order. */
  readonly locales: readonly LocaleValuesPageLocale[];
  /** Pass this back as `cursor`, with the same filters, to read the next page. Absent on the last page. */
  readonly nextCursor?: string;
}

/** Input for {@link localeValuesPage}. */
export interface LocaleValuesPageInput extends LocaleValuesInput {
  /** Keep only these exact key names. */
  readonly keys?: readonly string[];
  /** Keep only keys whose name, source text, or target text contains this text, ignoring case. */
  readonly query?: string;
  /** The most entries the page holds, a whole number from 1 to {@link PAGE_LIMIT_CAP}. Defaults to {@link PAGE_LIMIT_DEFAULT}. */
  readonly limit?: number;
  /** The `nextCursor` of the previous page. Omit it to read the first page. */
  readonly cursor?: string;
}

type EntryMatcher = (entry: LocaleValuesPageEntry) => boolean;

function keyMatcher(keys: readonly string[] | undefined): EntryMatcher {
  if (keys === undefined) {
    return () => true;
  }
  const wanted = new Set(keys);
  return (entry) => wanted.has(entry.key);
}

function queryMatcher(query: string | undefined): EntryMatcher {
  if (query === undefined) {
    return () => true;
  }
  const needle = query.toLowerCase();
  return (entry) =>
    [entry.key, entry.source, entry.target].some(
      (text) => text?.toLowerCase().includes(needle) === true,
    );
}

function filteredLocale(
  locale: LocaleValues,
  matches: EntryMatcher,
): LocaleItems<LocaleValuesPageEntry> {
  const items = locale.keys.flatMap((key) => {
    const pair = locale.values[key];
    return pair === undefined ? [] : [{ key, ...pair }];
  });
  return { locale: locale.locale, items: items.filter(matches) };
}

function canonicalFilters(input: LocaleValuesPageInput): unknown {
  return {
    locales: input.locales ?? null,
    keys: input.keys === undefined ? null : [...new Set(input.keys)].sort(),
    query: input.query ?? null,
  };
}

/**
 * Reads one page of current source and target text across the requested target locales,
 * optionally narrowed to exact keys or to a text query, and returns a cursor for the next page. It
 * is {@link localeValues} cut into pages, so a caller can scan a large project without holding
 * every value at once. It writes nothing and calls no provider.
 *
 * Entries come ordered by locale and then by key, in source key order followed by the keys only in
 * that target. Every call reads the files again, so a cursor whose key has moved or gone since the
 * previous page is refused rather than skipping or repeating entries. The same `keys` in another
 * order or with duplicates count as the same filter. Passing both `keys` and `query` keeps the
 * entries that match both.
 *
 * @param input - The config, the locale, key, and query filters, the page size, and the cursor.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The locales with at least one entry on this page, and the next cursor unless this is
 * the last page.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws {@link SdkError} `PAGE_CURSOR_INVALID`: the cursor is malformed, longer than
 * {@link PAGE_CURSOR_MAX_LENGTH}, was made under other filters, or no longer points at the key it
 * was made for.
 * @throws {@link SdkError} `PAGE_LIMIT_INVALID`: `limit` is not a whole number from 1 to
 * {@link PAGE_LIMIT_CAP}.
 * @throws `AdapterError`: the adapter refused a target locale file because it is malformed. Its
 * own code is preserved rather than remapped onto an {@link SdkErrorCode}.
 *
 * @example
 * ```ts
 * import { loadConfig, localeValuesPage } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * let cursor: string | undefined;
 * do {
 *   const page = await localeValuesPage({ config, query: "welcome", ...(cursor ? { cursor } : {}) });
 *   for (const locale of page.locales) {
 *     for (const entry of locale.entries) {
 *       console.log(`${locale.locale} ${entry.key}: ${entry.target ?? "(missing)"}`);
 *     }
 *   }
 *   cursor = page.nextCursor;
 * } while (cursor !== undefined);
 * ```
 */
export async function localeValuesPage(
  input: LocaleValuesPageInput,
  deps: LocaleValuesDeps = {},
): Promise<LocaleValuesPage> {
  const locales = await localeValues(
    {
      config: input.config,
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
      ...(input.locales !== undefined ? { locales: input.locales } : {}),
    },
    deps,
  );
  const byKey = keyMatcher(input.keys);
  const byQuery = queryMatcher(input.query);
  const page = pageAcrossLocales(
    locales.map((locale) => filteredLocale(locale, (entry) => byKey(entry) && byQuery(entry))),
    {
      filters: canonicalFilters(input),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    },
  );
  return {
    locales: page.locales.map((entry) => ({ locale: entry.locale, entries: entry.items })),
    ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
  };
}

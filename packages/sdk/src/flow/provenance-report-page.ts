import { pageAcrossLocales } from "../paging/page-across-locales.js";
import {
  type ProvenanceBucket,
  type ProvenanceReport,
  type ProvenanceReportDeps,
  type ProvenanceReportEntry,
  type ProvenanceReportInput,
  type ProvenanceReportLocale,
  type ProvenanceReportResult,
  provenanceReport,
} from "./provenance-report.js";

/** Input for {@link provenanceReportPage}. */
export interface ProvenanceReportPageInput extends ProvenanceReportInput {
  /** List only the entries in these buckets. The counts always cover every bucket. */
  readonly buckets?: readonly ProvenanceBucket[];
  /** The most entries the page holds, a whole number from 1 to {@link PAGE_LIMIT_CAP}. Defaults to {@link PAGE_LIMIT_DEFAULT}. */
  readonly limit?: number;
  /** The `nextCursor` of the previous page. Omit it to read the first page. */
  readonly cursor?: string;
}

/** One target locale's part of a {@link ProvenanceReportPage}. */
export interface ProvenanceReportPageLocale extends Omit<ProvenanceReportLocale, "entries"> {
  /**
   * This locale's entries on the page, in source key order. Absent when the page holds none of
   * them; {@link ProvenanceReportLocale.total} and {@link ProvenanceReportLocale.counts} are on
   * every page.
   */
  readonly entries?: readonly ProvenanceReportEntry[];
}

/** One page of a {@link ProvenanceReport}, as returned by {@link provenanceReportPage}. */
export interface ProvenanceReportPage extends Omit<ProvenanceReport, "locales"> {
  /** Every requested target locale, in configured order, each with its entries on this page. */
  readonly locales: readonly ProvenanceReportPageLocale[];
  /** Pass this back as `cursor`, with the same filters, to read the next page. Absent on the last page. */
  readonly nextCursor?: string;
}

/**
 * The result of {@link provenanceReportPage}: a page, or the same `available: false` result
 * {@link provenanceReport} returns when the provenance file cannot be read.
 */
export type ProvenanceReportPageResult =
  | ProvenanceReportPage
  | Exclude<ProvenanceReportResult, ProvenanceReport>;

function canonicalFilters(input: ProvenanceReportPageInput): unknown {
  return {
    locales: input.locales ?? null,
    buckets: input.buckets === undefined ? null : [...new Set(input.buckets)].sort(),
  };
}

/**
 * Builds a {@link provenanceReport} and returns its entries one page at a time, optionally only
 * those in some buckets, with a cursor for the next page. Every page carries every locale's
 * complete `total` and `counts`; only the entries are paged. It writes nothing and calls no
 * provider.
 *
 * Entries come ordered by locale and then in source key order. Every call builds the report
 * again, so a cursor whose key has moved or gone since the previous page is refused rather than
 * skipping or repeating entries. The same `buckets` in another order count as the same filter.
 *
 * @param input - The config, the locale and bucket filters, the page size, and the cursor.
 * @param deps - Optional adapter registry, file-system, and clock overrides.
 * @returns The page, or `available: false` when the provenance file cannot be read.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `PAGE_CURSOR_INVALID`: the cursor is malformed, longer than
 * {@link PAGE_CURSOR_MAX_LENGTH}, was made under other filters, or no longer points at the key it
 * was made for.
 * @throws {@link SdkError} `PAGE_LIMIT_INVALID`: `limit` is not a whole number from 1 to
 * {@link PAGE_LIMIT_CAP}.
 * @throws `AdapterError`: a target locale file is malformed. Its own code is preserved.
 *
 * @example
 * ```ts
 * import { loadConfig, provenanceReportPage } from "@verbatra/sdk";
 *
 * const page = await provenanceReportPage({
 *   config: await loadConfig(),
 *   buckets: ["external"],
 *   limit: 50,
 * });
 * if (page.available) {
 *   for (const locale of page.locales) {
 *     console.log(locale.locale, locale.counts.external, locale.entries?.map((e) => e.key));
 *   }
 * }
 * ```
 */
export async function provenanceReportPage(
  input: ProvenanceReportPageInput,
  deps: ProvenanceReportDeps = {},
): Promise<ProvenanceReportPageResult> {
  const { buckets, limit, cursor, ...reportInput } = input;
  const report = await provenanceReport(reportInput, deps);
  if (!report.available) {
    return report;
  }
  const wanted = buckets === undefined ? undefined : new Set(buckets);
  const page = pageAcrossLocales(
    report.locales.map((locale) => ({
      locale: locale.locale,
      items: locale.entries.filter((entry) => wanted === undefined || wanted.has(entry.bucket)),
    })),
    {
      filters: canonicalFilters(input),
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    },
  );
  const entriesByLocale = new Map(page.locales.map((entry) => [entry.locale, entry.items]));
  return {
    ...report,
    locales: report.locales.map(({ entries: _all, ...locale }) => {
      const entries = entriesByLocale.get(locale.locale);
      return entries === undefined ? locale : { ...locale, entries };
    }),
    ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
  };
}

import { createHash } from "node:crypto";
import { z } from "zod";
import { SdkError } from "../errors.js";

/** The number of items a page holds when the caller passes no `limit`. */
export const PAGE_LIMIT_DEFAULT = 200;

/** The largest `limit` a page accepts. */
export const PAGE_LIMIT_CAP = 1000;

/** One locale's items within a page, or within the full list a page is cut from. */
export interface PagedLocale<Item> {
  /** The locale these items belong to. */
  readonly locale: string;
  /** The locale's items, in a stable order. */
  readonly items: readonly Item[];
}

/** One page cut from a per-locale list, as returned by {@link pageAcrossLocales}. */
export interface LocalePage<Item> {
  /** The locales that hold at least one item on this page, in the order of the full list. */
  readonly locales: readonly PagedLocale<Item>[];
  /** Pass this back as `cursor` to read the next page. Absent on the last page. */
  readonly nextCursor?: string;
}

/** Which page {@link pageAcrossLocales} cuts. */
export interface PageRequest {
  /**
   * The filters the full list was built with, as a JSON-serializable value in a canonical order.
   * A cursor remembers a digest of them and is refused under any other filters.
   */
  readonly filters: unknown;
  /** The most items the page holds, a whole number from 1 to {@link PAGE_LIMIT_CAP}. Defaults to {@link PAGE_LIMIT_DEFAULT}. */
  readonly limit?: number;
  /** The `nextCursor` of the previous page. Omit it to read the first page. */
  readonly cursor?: string;
}

interface CursorPosition {
  readonly locale: string;
  readonly index: number;
  readonly key: string;
}

interface DecodedCursor {
  readonly locale: string;
  readonly index: number;
  readonly keyDigest: string;
}

const cursorPayloadSchema = z.strictObject({
  v: z.literal(1),
  f: z.string(),
  l: z.string(),
  i: z.number().int().min(0),
  k: z.string(),
});

function staleCursor(): SdkError {
  return new SdkError(
    "PAGE_CURSOR_INVALID",
    "The cursor no longer matches the project or these parameters; call again without a cursor.",
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function filtersFingerprint(filters: unknown): string {
  return digest(JSON.stringify(filters));
}

function encodeCursor(filters: string, position: CursorPosition): string {
  const payload = {
    v: 1,
    f: filters,
    l: position.locale,
    i: position.index,
    k: digest(position.key),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string, filters: string): DecodedCursor {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw staleCursor();
  }
  const parsed = cursorPayloadSchema.safeParse(raw);
  if (!parsed.success || parsed.data.f !== filters) {
    throw staleCursor();
  }
  return { locale: parsed.data.l, index: parsed.data.i, keyDigest: parsed.data.k };
}

function startOf<Item extends { readonly key: string }>(
  locales: readonly PagedLocale<Item>[],
  position: DecodedCursor | undefined,
): { readonly localeIndex: number; readonly itemIndex: number } {
  if (position === undefined) {
    return { localeIndex: 0, itemIndex: 0 };
  }
  const localeIndex = locales.findIndex((entry) => entry.locale === position.locale);
  const key = locales[localeIndex]?.items[position.index]?.key;
  if (key === undefined || digest(key) !== position.keyDigest) {
    throw staleCursor();
  }
  return { localeIndex, itemIndex: position.index };
}

function nextPosition<Item extends { readonly key: string }>(
  locales: readonly PagedLocale<Item>[],
  localeIndex: number,
  itemIndex: number,
): CursorPosition | undefined {
  for (let index = localeIndex; index < locales.length; index += 1) {
    const entry = locales[index];
    const from = index === localeIndex ? itemIndex : 0;
    const item = entry?.items[from];
    if (entry !== undefined && item !== undefined) {
      return { locale: entry.locale, index: from, key: item.key };
    }
  }
  return undefined;
}

function pageLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return PAGE_LIMIT_DEFAULT;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIMIT_CAP) {
    throw new SdkError(
      "PAGE_LIMIT_INVALID",
      `The page limit must be a whole number from 1 to ${PAGE_LIMIT_CAP}, got ${String(limit)}.`,
    );
  }
  return limit;
}

/**
 * Cuts one page from a list of items grouped by locale, walking the locales in order and each
 * locale's items in order, and returns a cursor for the next page. It reads nothing and is the
 * paging that {@link localeValuesPage} and the MCP server's paged tools use, for a caller that
 * builds its own per-locale list, such as the entries of a {@link provenanceReport}.
 *
 * The cursor is opaque. It records the position of the next item, a digest of that item's key, and
 * a digest of `filters`, so a cursor made under other filters, or one whose key has since moved
 * or gone because the files changed, is refused rather than skipping or repeating items. Every
 * item needs a `key`.
 *
 * @param locales - The full list, every locale with its items, in a stable order.
 * @param request - The filters the list was built with, the page size, and the previous cursor.
 * @returns The locales with at least one item on this page, and the next cursor unless this is
 * the last page.
 *
 * @throws {@link SdkError} `PAGE_CURSOR_INVALID`: the cursor is malformed, was made under other
 * filters, or no longer points at the key it was made for.
 * @throws {@link SdkError} `PAGE_LIMIT_INVALID`: `limit` is not a whole number from 1 to
 * {@link PAGE_LIMIT_CAP}.
 *
 * @example
 * ```ts
 * import { loadConfig, pageAcrossLocales, provenanceReport } from "@verbatra/sdk";
 *
 * const report = await provenanceReport({ config: await loadConfig() });
 * if (report.available) {
 *   const page = pageAcrossLocales(
 *     report.locales.map((locale) => ({ locale: locale.locale, items: locale.entries })),
 *     { filters: { buckets: null }, limit: 50 },
 *   );
 *   console.log(page.locales, page.nextCursor);
 * }
 * ```
 */
export function pageAcrossLocales<Item extends { readonly key: string }>(
  locales: readonly PagedLocale<Item>[],
  request: PageRequest,
): LocalePage<Item> {
  const limit = pageLimit(request.limit);
  const fingerprint = filtersFingerprint(request.filters);
  const position =
    request.cursor === undefined ? undefined : decodeCursor(request.cursor, fingerprint);
  const start = startOf(locales, position);
  const page: PagedLocale<Item>[] = [];
  let remaining = limit;
  let localeIndex = start.localeIndex;
  let itemIndex = start.itemIndex;
  for (const entry of locales.slice(start.localeIndex)) {
    if (remaining === 0) {
      break;
    }
    const items = entry.items.slice(itemIndex, itemIndex + remaining);
    if (items.length > 0) {
      page.push({ locale: entry.locale, items });
    }
    remaining -= items.length;
    itemIndex += items.length;
    if (itemIndex >= entry.items.length) {
      localeIndex += 1;
      itemIndex = 0;
    }
  }
  const next = nextPosition(locales, localeIndex, itemIndex);
  return next === undefined
    ? { locales: page }
    : { locales: page, nextCursor: encodeCursor(fingerprint, next) };
}

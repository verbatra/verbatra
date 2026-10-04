import { createHash } from "node:crypto";
import { z } from "zod";
import { SdkError } from "../errors.js";

/** The number of items a page holds when the caller passes no `limit`. */
export const PAGE_LIMIT_DEFAULT = 200;

/** The largest `limit` a page accepts. */
export const PAGE_LIMIT_CAP = 1000;

/** The longest `cursor` a paged read accepts. */
export const PAGE_CURSOR_MAX_LENGTH = 512;

export interface LocaleItems<Item> {
  readonly locale: string;
  readonly items: readonly Item[];
}

export interface CrossLocalePage<Item> {
  readonly locales: readonly LocaleItems<Item>[];
  readonly nextCursor?: string;
}

export interface CrossLocalePageRequest {
  readonly filters: unknown;
  readonly limit?: number;
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
  if (cursor.length > PAGE_CURSOR_MAX_LENGTH) {
    throw staleCursor();
  }
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
  locales: readonly LocaleItems<Item>[],
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
  locales: readonly LocaleItems<Item>[],
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

export function pageAcrossLocales<Item extends { readonly key: string }>(
  locales: readonly LocaleItems<Item>[],
  request: CrossLocalePageRequest,
): CrossLocalePage<Item> {
  const limit = pageLimit(request.limit);
  const fingerprint = filtersFingerprint(request.filters);
  const position =
    request.cursor === undefined ? undefined : decodeCursor(request.cursor, fingerprint);
  const start = startOf(locales, position);
  const page: LocaleItems<Item>[] = [];
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

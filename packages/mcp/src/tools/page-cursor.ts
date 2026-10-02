import { z } from "zod";
import { McpInvalidParamsError } from "./define-tool.js";

export const PAGE_LIMIT_DEFAULT = 200;
export const PAGE_LIMIT_CAP = 1000;

export const pageLimitSchema = z.number().int().min(1).max(PAGE_LIMIT_CAP).optional();
export const pageCursorSchema = z.string().min(1).max(4096).optional();

export interface PagedLocale<Item> {
  readonly locale: string;
  readonly items: readonly Item[];
}

export interface Page<Item> {
  readonly locales: readonly PagedLocale<Item>[];
  readonly nextCursor?: string;
}

interface CursorPosition {
  readonly locale: string;
  readonly index: number;
  readonly key: string;
}

const cursorPayloadSchema = z.strictObject({
  v: z.literal(1),
  f: z.string(),
  l: z.string(),
  i: z.number().int().min(0),
  k: z.string(),
});

const STALE_CURSOR =
  "the cursor no longer matches the project or these parameters; call again without a cursor.";

function encodeCursor(filters: string, position: CursorPosition): string {
  const payload = { v: 1, f: filters, l: position.locale, i: position.index, k: position.key };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string, filters: string): CursorPosition {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new McpInvalidParamsError("cursor", STALE_CURSOR);
  }
  const parsed = cursorPayloadSchema.safeParse(raw);
  if (!parsed.success || parsed.data.f !== filters) {
    throw new McpInvalidParamsError("cursor", STALE_CURSOR);
  }
  return { locale: parsed.data.l, index: parsed.data.i, key: parsed.data.k };
}

function startOf<Item extends { readonly key: string }>(
  locales: readonly PagedLocale<Item>[],
  position: CursorPosition | undefined,
): { readonly localeIndex: number; readonly itemIndex: number } {
  if (position === undefined) {
    return { localeIndex: 0, itemIndex: 0 };
  }
  const localeIndex = locales.findIndex((entry) => entry.locale === position.locale);
  if (locales[localeIndex]?.items[position.index]?.key !== position.key) {
    throw new McpInvalidParamsError("cursor", STALE_CURSOR);
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

export function pageAcrossLocales<Item extends { readonly key: string }>(
  locales: readonly PagedLocale<Item>[],
  request: { readonly filters: string; readonly limit: number; readonly cursor?: string },
): Page<Item> {
  const position =
    request.cursor === undefined ? undefined : decodeCursor(request.cursor, request.filters);
  const start = startOf(locales, position);
  const page: PagedLocale<Item>[] = [];
  let remaining = request.limit;
  let localeIndex = start.localeIndex;
  let itemIndex = start.itemIndex;
  while (localeIndex < locales.length && remaining > 0) {
    const entry = locales[localeIndex] as PagedLocale<Item>;
    const items = entry.items.slice(itemIndex, itemIndex + remaining);
    page.push({ locale: entry.locale, items });
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
    : { locales: page, nextCursor: encodeCursor(request.filters, next) };
}

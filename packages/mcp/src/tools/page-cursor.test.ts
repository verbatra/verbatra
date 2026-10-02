import { describe, expect, it } from "vitest";
import { McpInvalidParamsError } from "./define-tool.js";
import { filtersFingerprint, type PagedLocale, pageAcrossLocales } from "./page-cursor.js";

interface Item {
  readonly key: string;
}

function locale(name: string, keys: readonly string[]): PagedLocale<Item> {
  return { locale: name, items: keys.map((key) => ({ key })) };
}

const FILTERS = { locales: null };
const DATA = [locale("de", ["a", "b", "c"]), locale("es", []), locale("fr", ["a", "b"])];

function cursorAfter(limit: number, data = DATA, filters: unknown = FILTERS): string {
  const page = pageAcrossLocales(data, { filters, limit });
  if (page.nextCursor === undefined) {
    throw new Error("expected a next page");
  }
  return page.nextCursor;
}

function forged(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function flatten(page: ReturnType<typeof pageAcrossLocales<Item>>): string[] {
  return page.locales.flatMap((entry) => entry.items.map((item) => `${entry.locale}:${item.key}`));
}

function expectInvalid(run: () => unknown): void {
  expect(run).toThrow(McpInvalidParamsError);
  expect(run).toThrow(/^Invalid input for field "cursor": /);
}

describe("pageAcrossLocales", () => {
  it("walks every item exactly once whatever the page size", () => {
    for (const limit of [1, 2, 3, 4, 5, 6]) {
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = pageAcrossLocales(DATA, {
          filters: FILTERS,
          limit,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        seen.push(...flatten(page));
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      expect(seen, `limit ${limit}`).toEqual(["de:a", "de:b", "de:c", "fr:a", "fr:b"]);
    }
  });

  it("lists a locale only when the page holds one of its items, wherever the boundary falls", () => {
    for (const limit of [1, 2, 3, 4, 5]) {
      let cursor: string | undefined;
      do {
        const page = pageAcrossLocales(DATA, {
          filters: FILTERS,
          limit,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        expect(
          page.locales.every((entry) => entry.items.length > 0),
          `limit ${limit}`,
        ).toBe(true);
        cursor = page.nextCursor;
      } while (cursor !== undefined);
    }
  });

  it("returns no locales and no cursor when nothing matches", () => {
    expect(
      pageAcrossLocales([locale("de", []), locale("fr", [])], { filters: FILTERS, limit: 5 }),
    ).toEqual({
      locales: [],
    });
  });

  it("ends without a cursor when the last page stops on the last item before empty locales", () => {
    const data = [locale("de", ["a", "b"]), locale("es", []), locale("fr", [])];

    expect(pageAcrossLocales(data, { filters: FILTERS, limit: 2 }).nextCursor).toBeUndefined();
  });

  it("rejects a forged index far past the end", () => {
    const real = JSON.parse(Buffer.from(cursorAfter(2), "base64url").toString("utf8"));

    expectInvalid(() =>
      pageAcrossLocales(DATA, {
        filters: FILTERS,
        limit: 2,
        cursor: forged({ ...real, i: 1_000_000 }),
      }),
    );
  });

  it("rejects a cursor whose locale is no longer requested", () => {
    const cursor = cursorAfter(4);

    expectInvalid(() =>
      pageAcrossLocales([locale("de", ["a", "b", "c"])], { filters: FILTERS, limit: 2, cursor }),
    );
  });

  it("rejects a cursor whose key moved to another locale", () => {
    const cursor = cursorAfter(2);
    const moved = [locale("de", ["a", "b"]), locale("fr", ["c", "a", "b"])];

    expectInvalid(() => pageAcrossLocales(moved, { filters: FILTERS, limit: 2, cursor }));
  });

  it.each([
    "not base64 !!",
    Buffer.from("not json").toString("base64url"),
    forged({ v: 2, f: "x", l: "de", i: 0, k: "y" }),
    forged({ v: 1, f: filtersFingerprint(FILTERS), l: "de", i: -1, k: "y" }),
  ])("rejects the tampered cursor %s", (cursor) => {
    expectInvalid(() => pageAcrossLocales(DATA, { filters: FILTERS, limit: 2, cursor }));
  });

  it("rejects a cursor made under other filters", () => {
    const cursor = cursorAfter(2);

    expectInvalid(() =>
      pageAcrossLocales(DATA, { filters: { locales: ["de"] }, limit: 2, cursor }),
    );
  });

  it("keeps the cursor short however large the filters are", () => {
    const filters = { keys: Array.from({ length: 1000 }, (_, i) => `a.rather.long.key.name.${i}`) };
    const data = [locale("de", filters.keys)];

    expect(cursorAfter(10, data, filters).length).toBeLessThan(200);
  });
});

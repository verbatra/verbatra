import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { type LocaleValuesPage, localeValuesPage } from "./locale-values-page.js";

const cfg = (targetLocales: readonly string[] = ["de", "fr"]): VerbatraConfig =>
  baseConfig({ targetLocales: [...targetLocales], format: "i18next-json" });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown>>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, values] of Object.entries(targets)) {
    await writeJsonFile(join(dir, "locales", `${locale}.json`), values);
  }
  return dir;
}

function keysOf(page: LocaleValuesPage): string[] {
  return page.locales.flatMap((locale) =>
    locale.entries.map((entry) => `${locale.locale}:${entry.key}`),
  );
}

const SOURCE = { greeting: "Hello", title: "Welcome", cart: "Basket" };

describe("localeValuesPage", () => {
  it("returns every entry with its source, target and provenance on one page", async () => {
    const dir = await project(SOURCE, { de: { cart: "Warenkorb", orphan: "Waise" } });

    const page = await localeValuesPage({ config: cfg(["de"]), cwd: dir });

    expect(page).toEqual({
      locales: [
        {
          locale: "de",
          entries: [
            { key: "greeting", source: "Hello" },
            { key: "title", source: "Welcome" },
            {
              key: "cart",
              source: "Basket",
              target: "Warenkorb",
              provenance: { origin: "unrecorded", reviewState: "unreviewed" },
            },
            {
              key: "orphan",
              target: "Waise",
              provenance: { origin: "unrecorded", reviewState: "unreviewed" },
            },
          ],
        },
      ],
    });
  });

  it("matches a query against key, source and target, ignoring case", async () => {
    const dir = await project(SOURCE, { de: { cart: "Warenkorb" } });
    const read = (query: string) => localeValuesPage({ config: cfg(["de"]), cwd: dir, query });

    expect(keysOf(await read("WARENKORB"))).toEqual(["de:cart"]);
    expect(keysOf(await read("titl"))).toEqual(["de:title"]);
    expect(keysOf(await read("hello"))).toEqual(["de:greeting"]);
  });

  it("keeps the entries that match both keys and query", async () => {
    const dir = await project(SOURCE, { de: {} });

    const page = await localeValuesPage({
      config: cfg(["de"]),
      cwd: dir,
      keys: ["title", "cart"],
      query: "come",
    });

    expect(keysOf(page)).toEqual(["de:title"]);
  });

  it("walks every entry of the requested locales exactly once", async () => {
    const dir = await project(SOURCE, { de: {}, fr: {} });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await localeValuesPage({
        config: cfg(),
        cwd: dir,
        limit: 2,
        ...(cursor !== undefined ? { cursor } : {}),
      });
      seen.push(...keysOf(page));
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    expect(seen).toEqual([
      "de:greeting",
      "de:title",
      "de:cart",
      "fr:greeting",
      "fr:title",
      "fr:cart",
    ]);
  });

  it("accepts a cursor for the same keys in another order", async () => {
    const dir = await project(SOURCE, { de: {} });
    const first = await localeValuesPage({
      config: cfg(["de"]),
      cwd: dir,
      keys: ["cart", "greeting"],
      limit: 1,
    });

    const second = await localeValuesPage({
      config: cfg(["de"]),
      cwd: dir,
      keys: ["greeting", "cart", "cart"],
      limit: 1,
      ...(first.nextCursor !== undefined ? { cursor: first.nextCursor } : {}),
    });

    expect(keysOf(second)).toEqual(["de:cart"]);
  });

  it("refuses a cursor made under another query", async () => {
    const dir = await project(SOURCE, { de: {} });
    const first = await localeValuesPage({ config: cfg(["de"]), cwd: dir, limit: 1 });

    await expect(
      localeValuesPage({
        config: cfg(["de"]),
        cwd: dir,
        query: "e",
        limit: 1,
        ...(first.nextCursor !== undefined ? { cursor: first.nextCursor } : {}),
      }),
    ).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID" });
  });

  it("refuses a limit outside the accepted range", async () => {
    const dir = await project(SOURCE, { de: {} });

    await expect(
      localeValuesPage({ config: cfg(["de"]), cwd: dir, limit: 0 }),
    ).rejects.toBeInstanceOf(SdkError);
  });
});

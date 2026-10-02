import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeContext,
  makeProject,
  writeJsonFile,
} from "../test-support.js";
import type { McpToolContext } from "../types.js";
import { localeValuesTool } from "./locale-values.js";

interface ValuesPage {
  readonly locales: readonly {
    readonly locale: string;
    readonly entries: readonly { readonly key: string }[];
  }[];
  readonly nextCursor?: string;
}

function twoLocaleContext(dir: string): McpToolContext {
  return makeContext({
    cwd: dir,
    config: baseLoadedConfig({ config: baseVerbatraConfig({ targetLocales: ["de", "fr"] }) }),
  });
}

async function page(params: Record<string, unknown>, context: McpToolContext): Promise<ValuesPage> {
  const outcome = await localeValuesTool.execute(params, context);
  if (outcome.kind !== "ok") {
    throw new Error(outcome.message);
  }
  return outcome.result as ValuesPage;
}

function keysOf(result: ValuesPage): string[] {
  return result.locales.flatMap((locale) =>
    locale.entries.map((entry) => `${locale.locale}:${entry.key}`),
  );
}

const SOURCE = Object.fromEntries(
  Array.from({ length: 7 }, (_, index) => [`key${index}`, `Text ${index}`]),
);

describe("locale.values", () => {
  it("returns source, target and provenance for every key", async () => {
    const dir = await makeProject(
      { greeting: "Hello", title: "Welcome" },
      { de: { greeting: "Hallo", orphan: "Waise" } },
    );

    const outcome = await localeValuesTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        locales: [
          {
            locale: "de",
            entries: [
              {
                key: "greeting",
                source: "Hello",
                target: "Hallo",
                provenance: { origin: "unrecorded", reviewState: "unreviewed" },
              },
              { key: "title", source: "Welcome" },
              {
                key: "orphan",
                target: "Waise",
                provenance: { origin: "unrecorded", reviewState: "unreviewed" },
              },
            ],
          },
        ],
      },
    });
  });

  it("keeps only the listed keys", async () => {
    const dir = await makeProject({ greeting: "Hello", title: "Welcome" }, { de: {} });

    const result = await page({ keys: ["title", "absent"] }, makeContext({ cwd: dir }));

    expect(keysOf(result)).toEqual(["de:title"]);
  });

  it("matches a query against key, source and target, ignoring case", async () => {
    const dir = await makeProject(
      { greeting: "Hello", title: "Welcome", cart: "Basket" },
      { de: { cart: "Warenkorb" } },
    );

    const result = await page({ query: "WARENKORB" }, makeContext({ cwd: dir }));
    const byKey = await page({ query: "titl" }, makeContext({ cwd: dir }));
    const bySource = await page({ query: "hello" }, makeContext({ cwd: dir }));

    expect(keysOf(result)).toEqual(["de:cart"]);
    expect(keysOf(byKey)).toEqual(["de:title"]);
    expect(keysOf(bySource)).toEqual(["de:greeting"]);
  });

  it("narrows to the requested locales", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {}, fr: {} });

    const result = await page({ locales: ["fr"] }, twoLocaleContext(dir));

    expect(result.locales.map((locale) => locale.locale)).toEqual(["fr"]);
  });

  it("walks every key of every locale exactly once across pages", async () => {
    const dir = await makeProject(SOURCE, { de: {}, fr: {} });
    const context = twoLocaleContext(dir);
    const seen: string[] = [];
    let cursor: string | undefined;
    let calls = 0;
    do {
      const result = await page({ limit: 3, ...(cursor ? { cursor } : {}) }, context);
      expect(keysOf(result).length).toBeLessThanOrEqual(3);
      seen.push(...keysOf(result));
      cursor = result.nextCursor;
      calls += 1;
    } while (cursor !== undefined);

    const expected = ["de", "fr"].flatMap((locale) =>
      Object.keys(SOURCE).map((key) => `${locale}:${key}`),
    );
    expect(seen).toEqual(expected);
    expect(calls).toBe(5);
  });

  it("omits nextCursor when the last page ends exactly at the last key", async () => {
    const dir = await makeProject({ a: "A", b: "B" }, { de: {} });

    const result = await page({ limit: 2 }, makeContext({ cwd: dir }));

    expect(result.nextCursor).toBeUndefined();
  });

  it("defaults to pages of 200 entries", async () => {
    const source = Object.fromEntries(Array.from({ length: 205 }, (_, i) => [`k${i}`, "v"]));
    const dir = await makeProject(source, { de: {} });

    const result = await page({}, makeContext({ cwd: dir }));

    expect(keysOf(result)).toHaveLength(200);
    expect(result.nextCursor).toBeDefined();
  });

  it("rejects a cursor once the key it points at is gone", async () => {
    const dir = await makeProject(SOURCE, { de: {} });
    const context = makeContext({ cwd: dir });
    const first = await page({ limit: 3 }, context);
    const { key3: _removed, ...rest } = SOURCE;
    await writeJsonFile(join(dir, "locales", "en.json"), rest);

    const outcome = await localeValuesTool.execute({ limit: 3, cursor: first.nextCursor }, context);

    expect(outcome).toEqual({
      kind: "invalid",
      message: expect.stringMatching(/^Invalid input for field "cursor": /),
    });
  });

  it("rejects a cursor from other filter parameters", async () => {
    const dir = await makeProject(SOURCE, { de: {} });
    const context = makeContext({ cwd: dir });
    const first = await page({ limit: 3 }, context);

    const outcome = await localeValuesTool.execute(
      { limit: 3, query: "text", cursor: first.nextCursor },
      context,
    );

    expect(outcome.kind).toBe("invalid");
  });

  it.each(["not-a-cursor", Buffer.from("[1]").toString("base64url")])(
    "rejects the malformed cursor %s",
    async (cursor) => {
      const dir = await makeProject(SOURCE, { de: {} });

      const outcome = await localeValuesTool.execute({ cursor }, makeContext({ cwd: dir }));

      expect(outcome.kind).toBe("invalid");
    },
  );

  it.each([
    { limit: 1001 },
    { limit: 0 },
    { keys: [] },
    { locales: [] },
    { keys: ["a"], query: "a" },
    { unknown: true },
  ])("rejects the invalid input %j", async (params) => {
    const outcome = await localeValuesTool.execute(params, makeContext());

    expect(outcome.kind).toBe("invalid");
  });

  it("fails with UNKNOWN_LOCALE for a locale that is not a target", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await localeValuesTool.execute({ locales: ["xx"] }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("UNKNOWN_LOCALE"),
    });
  });
});

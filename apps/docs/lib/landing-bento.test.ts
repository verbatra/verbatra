import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { FORMAT_SAMPLES } from "@/lib/format-samples";
import { headingSlugs } from "@/lib/heading-slugs";
import { i18n, type Locale } from "@/lib/i18n";
import {
  BENTO_FORMAT_KEY,
  BENTO_FORMAT_LINES,
  BENTO_KEY_ENV_VARS,
  BENTO_KEYS_LINK,
  BENTO_NONE_PROVIDER,
  BENTO_PROVIDER_DIFF,
  BENTO_PROVIDER_FROM,
  BENTO_PROVIDER_TO,
  BENTO_RUN_SUMMARY_CODE,
  BENTO_RUN_SUMMARY_FIELDS,
  BENTO_SAFETY_LINK,
  BENTO_TILES,
  bentoHref,
} from "@/lib/landing-bento";
import { MACHINE_PROVIDER_IDS } from "@/lib/landing-facts";
import { providerReleaseBadge } from "@/lib/release-badge";
import { STACK_IDS } from "@/lib/stacks";
import en from "@/messages/en.json";

const CONTENT = fileURLToPath(new URL("../content/docs", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

function pageSource(page: string, locale: Locale): string {
  const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
  const wanted = [
    `${page.replace(/^\/docs\//, "")}${suffix}.mdx`,
    `${page.replace(/^\/docs\//, "")}/index${suffix}.mdx`,
  ];
  const file = readdirSync(CONTENT, { recursive: true, encoding: "utf8" }).find((entry) =>
    wanted.includes(entry.replace(/\([^)]+\)\//g, "")),
  );
  if (!file) throw new Error(`no ${wanted.join(" or ")} under ${CONTENT}`);
  return readFileSync(join(CONTENT, file), "utf8");
}

describe("bento tiles", () => {
  it("cover exactly the bento copy in en.json, once each", () => {
    expect(BENTO_TILES.map((tile) => tile.key).sort()).toEqual(
      Object.keys(en.landing.bento.items).sort(),
    );
  });

  it("fill whole twelve-column rows on desktop", () => {
    const rows: number[] = [];
    let current = 0;
    for (const tile of BENTO_TILES) {
      current += tile.span;
      if (current === 12) {
        rows.push(current);
        current = 0;
      }
      expect(current).toBeLessThan(12);
    }
    expect(current).toBe(0);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  for (const locale of i18n.languages) {
    it(`points every ${locale} docs link at a page and heading that exist`, () => {
      const links = [
        ...BENTO_TILES.flatMap((tile) => tile.evidence),
        BENTO_NONE_PROVIDER,
        BENTO_KEYS_LINK,
        BENTO_SAFETY_LINK,
        ...STACK_IDS.map((id) => ({ page: `/docs/quickstart/${id}` })),
      ];
      for (const item of links) {
        const slugs = headingSlugs(pageSource(item.page, locale));
        const anchor = "anchors" in item ? item.anchors?.[locale] : undefined;
        if (anchor !== undefined) expect(slugs, `${item.page} in ${locale}`).toContain(anchor);
      }
    });
  }

  it("prefixes the locale and appends the localized anchor", () => {
    expect(bentoHref("en", BENTO_KEYS_LINK)).toBe("/docs/providers#keys-come-from-the-environment");
    expect(bentoHref("de", BENTO_KEYS_LINK)).toBe(
      "/de/docs/providers#keys-kommen-aus-der-umgebung",
    );
  });

  it("lays the tiles out as one wide and one tall tile, two halves and a full-width strip", () => {
    expect(BENTO_TILES.map((tile) => [tile.key, tile.span])).toEqual([
      ["providers", 8],
      ["keys", 4],
      ["formats", 6],
      ["sdk", 6],
      ["frameworks", 12],
    ]);
  });
});

describe("bento samples", () => {
  it("names one key variable per machine provider, exactly as the providers package reads them", () => {
    const source = readFileSync(join(REPO, "packages/ai-providers/src/key-env-vars.ts"), "utf8");
    const declared = [...source.matchAll(/"([A-Z_]+_API_KEY)"/g)].map(([, name]) => name);
    expect(Object.keys(BENTO_KEY_ENV_VARS)).toEqual([...MACHINE_PROVIDER_IDS]);
    expect(
      Object.values(BENTO_KEY_ENV_VARS)
        .map((variable) => variable.name)
        .sort(),
    ).toEqual([...declared].sort());
    for (const id of ["anthropic", "openai", "gemini", "deepl", "google-translate"] as const) {
      expect(source).toMatch(new RegExp(`"?${id}"?: "${BENTO_KEY_ENV_VARS[id].name}"`));
    }
  });

  it("marks as optional exactly the keys the providers page says usually are not needed", () => {
    const optional = MACHINE_PROVIDER_IDS.filter((id) => BENTO_KEY_ENV_VARS[id].optional);
    expect(optional).toEqual(["openai-compatible", "libretranslate"]);
    expect(pageSource("/docs/providers", "en")).toContain(
      "`openai-compatible` and `libretranslate` usually need no key.",
    );
  });

  it("dates only the key variables of providers the release badge dates", () => {
    expect(MACHINE_PROVIDER_IDS.filter((id) => providerReleaseBadge(id) !== null)).toEqual([
      "libretranslate",
    ]);
  });

  it("prints the RunSummary fields of the published sdk, leaving out only what is newer", () => {
    const declarations = readFileSync(join(REPO, "packages/sdk/dist/index.d.ts"), "utf8");
    const body = /^interface RunSummary \{\n([\s\S]*?)^\}/m.exec(declarations)?.[1] ?? "";
    const fields = [...body.matchAll(/^ {4}(readonly .+;)$/gm)].map(([, field]) => field);
    expect(fields.filter((field) => !field.startsWith("readonly cancelled?"))).toEqual([
      ...BENTO_RUN_SUMMARY_FIELDS,
    ]);
    for (const field of BENTO_RUN_SUMMARY_FIELDS)
      expect(BENTO_RUN_SUMMARY_CODE).toContain(`  ${field}`);
    expect(BENTO_RUN_SUMMARY_CODE).toContain("await translate({ config })");
    expect(typeof sdk.translate).toBe("function");
  });

  it("switches between two provider blocks the sdk accepts", async () => {
    for (const provider of [BENTO_PROVIDER_FROM, BENTO_PROVIDER_TO]) {
      const config = await sdk.loadConfig({
        cwd: CONTENT,
        configOverride: {
          sourceLocale: "en",
          targetLocales: ["de"],
          format: "i18next-json",
          files: { pattern: "locales/{locale}.json" },
          provider,
        },
      });
      expect(config.provider.id).toBe(provider.id);
    }
  });

  it("writes the gemini evidence chip with every option the sdk requires, as the diff's first block", async () => {
    const chip = BENTO_TILES.flatMap((tile) => tile.evidence).find((item) =>
      item.text.includes('id: "gemini"'),
    );
    const { id, options } = BENTO_PROVIDER_FROM;
    expect(chip?.text).toBe(
      `provider: { id: "${id}", options: { model: "${options.model}", maxOutputTokens: ${options.maxOutputTokens} } }`,
    );
    await expect(
      sdk.loadConfig({
        cwd: CONTENT,
        configOverride: {
          sourceLocale: "en",
          targetLocales: ["de"],
          format: "i18next-json",
          files: { pattern: "locales/{locale}.json" },
          provider: { id, options: { model: options.model } },
        },
      }),
    ).rejects.toThrow();
  });

  it("draws the provider diff from the two blocks, removed lines before added ones", () => {
    const text = BENTO_PROVIDER_DIFF.map((line) => line.text).join("\n");
    expect(text).toContain(`id: "${BENTO_PROVIDER_FROM.id}"`);
    expect(text).toContain(`model: "${BENTO_PROVIDER_FROM.options.model}"`);
    expect(text).toContain(`id: "${BENTO_PROVIDER_TO.id}"`);
    const signs = BENTO_PROVIDER_DIFF.map((line) => line.sign).join("");
    expect(signs).toMatch(/^ -+\++ $/);
    expect(signs.indexOf("+")).toBeGreaterThan(signs.lastIndexOf("-"));
  });

  it("takes every format line verbatim from the real adapter output for the same key", () => {
    for (const entry of BENTO_FORMAT_LINES) {
      const sample = FORMAT_SAMPLES[entry.format];
      expect(sample.text).toContain(entry.line);
      expect(entry.line).toContain(entry.placeholder);
      expect(entry.line.replace(/[^a-z]/gi, "").toLowerCase()).toContain(
        BENTO_FORMAT_KEY.split(".").at(-1),
      );
    }
    expect(new Set(BENTO_FORMAT_LINES.map((entry) => entry.placeholder)).size).toBeGreaterThan(2);
  });
});

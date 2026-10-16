import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { FORMAT_SAMPLES } from "@/lib/format-samples";
import { headingSlugs } from "@/lib/heading-slugs";
import { i18n } from "@/lib/i18n";
import {
  BENTO_FORMAT_EXAMPLE,
  BENTO_FORMAT_KEY,
  BENTO_KEY_ENV_VARS,
  BENTO_KEYS_LINK,
  BENTO_NONE_LINK,
  BENTO_PROVIDERS_LINK,
  BENTO_RUN_SUMMARY_CODE,
  BENTO_RUN_SUMMARY_FIELDS,
  BENTO_SAFETY_LINK,
  BENTO_TILES,
  bentoHref,
  FORMAT_FAMILIES,
  FORMAT_FAMILY,
  formatsInFamily,
} from "@/lib/landing-bento";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { STACK_IDS } from "@/lib/stacks";
import en from "@/messages/en.json";
import { docsPageSource } from "@/test-support/docs-page-source";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

describe("bento tiles", () => {
  it("cover exactly the bento copy in en.json, once each", () => {
    expect(BENTO_TILES.map((tile) => tile.key).sort()).toEqual(
      Object.keys(en.landing.bento.items).sort(),
    );
  });

  it("fill whole twelve-column rows beside the head, at both desktop widths", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/global.css", import.meta.url)), "utf8");
    const head = Number(/\.vk-bento-head \{\s+--grid-span: (\d+);/.exec(css)?.[1]);
    expect(head).toBe(4);
    for (const width of ["lg", "xl"] as const) {
      const spans = [head, ...BENTO_TILES.map((tile) => tile.span[width] ?? tile.span.lg)];
      let current = 0;
      for (const span of spans) {
        current += span;
        expect(current, width).toBeLessThanOrEqual(12);
        if (current === 12) current = 0;
      }
      expect(current, width).toBe(0);
    }
  });

  for (const locale of i18n.languages) {
    it(`points every ${locale} docs link at a page and heading that exist`, () => {
      const links = [
        ...BENTO_TILES.flatMap((tile) => tile.evidence),
        BENTO_NONE_LINK,
        BENTO_PROVIDERS_LINK,
        BENTO_KEYS_LINK,
        BENTO_SAFETY_LINK,
        ...STACK_IDS.map((id) => ({ page: `/docs/quickstart/${id}` })),
      ];
      for (const item of links) {
        const slugs = headingSlugs(docsPageSource(item.page, locale));
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

  it("notes the configurable key variable only where the provider config takes apiKeyEnvVar", () => {
    const config = readFileSync(
      join(REPO, "packages/ai-providers/src/openai-compatible/config.ts"),
      "utf8",
    );
    expect(config).toContain("apiKeyEnvVar");
    expect(MACHINE_PROVIDER_IDS.filter((id) => BENTO_KEY_ENV_VARS[id].configurable)).toEqual([
      "openai-compatible",
    ]);
    expect(en.landing.bento.items.keys.configurable).toContain("`apiKeyEnvVar`");
  });

  it("marks as optional exactly the keys the providers page says usually are not needed", () => {
    const optional = MACHINE_PROVIDER_IDS.filter((id) => BENTO_KEY_ENV_VARS[id].optional);
    expect(optional).toEqual(["openai-compatible", "libretranslate"]);
    expect(docsPageSource("/docs/providers", "en")).toContain(
      "`openai-compatible` and `libretranslate` usually need no key.",
    );
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
  });

  it("fills only the id slot of the provider block, which takes every listed id and no other", () => {
    const issues = (id: string) => {
      const result = sdk.verbatraConfigSchema.safeParse({
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id },
      });
      return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    };
    for (const id of [...MACHINE_PROVIDER_IDS, "none"]) {
      expect(issues(id), id).not.toContain("provider.id");
    }
    for (const id of MACHINE_PROVIDER_IDS) expect(issues(id), id).toContain("provider.options");
    expect(issues("bogus")).toContain("provider.id");
  });

  it("files every supported format under one family, each family holding at least two", () => {
    expect(Object.keys(FORMAT_FAMILY).sort()).toEqual([...SUPPORTED_FORMAT_IDS].sort());
    expect(FORMAT_FAMILIES.flatMap(formatsInFamily).toSorted()).toEqual(
      [...SUPPORTED_FORMAT_IDS].sort(),
    );
    for (const family of FORMAT_FAMILIES)
      expect(formatsInFamily(family).length, family).toBeGreaterThanOrEqual(2);
    expect(Object.keys(en.landing.bento.items.formats.families)).toEqual([...FORMAT_FAMILIES]);
  });

  it("takes the example line verbatim from the real adapter output for the key", () => {
    const entry = BENTO_FORMAT_EXAMPLE;
    const sample = FORMAT_SAMPLES[entry.format];
    expect(entry.file).toBe(sample.file);
    expect(sample.text).toContain(entry.line);
    expect(entry.line).toContain(entry.placeholder);
    expect(entry.line.replace(/[^a-z]/gi, "").toLowerCase()).toContain(
      BENTO_FORMAT_KEY.split(".").at(-1),
    );
  });
});

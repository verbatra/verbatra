import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { FORMAT_SAMPLES } from "@/lib/format-samples";
import { GATE_LOCK_HASHES, GATE_WITHHELD_LABEL } from "@/lib/gate-demo";
import { headingSlugs } from "@/lib/heading-slugs";
import { i18n, type Locale } from "@/lib/i18n";
import {
  BENTO_ADAPTER_CODE,
  BENTO_ADAPTER_IMPORTS,
  BENTO_FORMAT_KEY,
  BENTO_FORMAT_LINES,
  BENTO_KEY_ENV_VAR,
  BENTO_LOCK_CODE,
  BENTO_LOCK_LOCALE,
  BENTO_PROVIDER_DIFF,
  BENTO_PROVIDER_FROM,
  BENTO_PROVIDER_TO,
  BENTO_TILES,
  bentoHref,
} from "@/lib/landing-bento";
import { LANDING_CONFIG_CODE } from "@/lib/landing-code";
import en from "@/messages/en.json";

const CONTENT = fileURLToPath(new URL("../content/docs", import.meta.url));
const SITE_LOCK = JSON.parse(
  readFileSync(fileURLToPath(new URL("../verbatra.lock.json", import.meta.url)), "utf8"),
) as { version: number; locales: Record<string, Record<string, string>> };

function findPage(dir: string, name: string): string | undefined {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findPage(path, name);
      if (found) return found;
    } else if (entry.name === name) {
      return path;
    }
  }
  return undefined;
}

function pageSource(page: string, locale: Locale): string {
  const segments = page.replace(/^\/docs\//, "").split("/");
  const slug = segments.at(-1) ?? "";
  const dir = segments.length > 1 ? join(CONTENT, ...segments.slice(0, -1)) : CONTENT;
  const name = locale === i18n.defaultLanguage ? `${slug}.mdx` : `${slug}.${locale}.mdx`;
  const path = findPage(dir, name);
  if (!path) throw new Error(`no ${name} under ${dir}`);
  return readFileSync(path, "utf8");
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
    it(`points every ${locale} evidence link at a page and heading that exist`, () => {
      for (const tile of BENTO_TILES) {
        for (const item of tile.evidence) {
          const slugs = headingSlugs(pageSource(item.page, locale));
          const anchor = item.anchors?.[locale];
          if (anchor !== undefined) expect(slugs, `${item.text} in ${locale}`).toContain(anchor);
        }
      }
    });
  }

  it("prefixes the locale and appends the localized anchor", () => {
    const qa = BENTO_TILES.flatMap((tile) => tile.evidence).find((item) => item.anchors);
    if (!qa) throw new Error("anchored evidence missing");
    expect(bentoHref("en", qa)).toBe("/docs/cli/check#quality-check");
    expect(bentoHref("de", qa)).toBe("/de/docs/cli/check#qualitätsprüfung");
  });

  it("names the withheld label the integrity gate really prints", () => {
    const integrity = BENTO_TILES.find((tile) => tile.key === "integrity");
    expect(integrity?.evidence.map((item) => item.text)).toContain(GATE_WITHHELD_LABEL);
  });
});

describe("bento samples", () => {
  it("shows a lock file in the shape this site commits", () => {
    const lock = JSON.parse(BENTO_LOCK_CODE) as typeof SITE_LOCK;
    expect(lock.version).toBe(SITE_LOCK.version);
    expect(Object.keys(lock)).toEqual(Object.keys(SITE_LOCK));
    expect(lock.locales[BENTO_LOCK_LOCALE]).toEqual(GATE_LOCK_HASHES);
    for (const hash of Object.values(lock.locales[BENTO_LOCK_LOCALE] ?? {})) {
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("imports only what the sdk exports", () => {
    for (const name of BENTO_ADAPTER_IMPORTS) {
      expect(typeof (sdk as Record<string, unknown>)[name], name).toBe("function");
    }
    expect(BENTO_ADAPTER_CODE).toContain(".register(");
    expect(BENTO_ADAPTER_CODE).toContain("{ adapterRegistry }");
  });

  it("reads the key variable of the provider the config sample names", () => {
    expect(LANDING_CONFIG_CODE).toContain('id: "gemini"');
    expect(BENTO_KEY_ENV_VAR).toBe("GEMINI_API_KEY");
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

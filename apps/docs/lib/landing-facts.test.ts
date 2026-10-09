import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LICENSE_URL, RELEASES_URL } from "@/components/landing/links";
import { i18n } from "@/lib/i18n";
import {
  FORMAT_COUNT,
  HERO_COUNT_FACTS,
  HERO_FACTS,
  MACHINE_PROVIDER_IDS,
  OG_COUNT_FACTS,
  PROVIDER_COUNT,
  SUPPORTED_FORMAT_IDS,
  TRANSLATED_LOCALE_COUNT,
} from "@/lib/landing-facts";
import { PACKAGE_VERSION } from "@/lib/site";

function sourceOf(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function literalsIn(relativePath: string, pattern: RegExp): number {
  return sourceOf(relativePath).match(pattern)?.length ?? 0;
}

function quotedIn(block: string): ReadonlyArray<string> {
  return [...block.matchAll(/"([a-z0-9-]+)"/g)].map(([, id]) => id ?? "");
}

describe("landing facts", () => {
  it("counts every member of the core SupportedFormat union", () => {
    const literals = literalsIn(
      "../../../packages/core/src/model/supported-format.ts",
      /^\s*"[a-z0-9-]+",?$/gm,
    );
    expect(FORMAT_COUNT).toBe(literals);
  });

  it("counts every provider factory the sdk resolves", () => {
    const literals = literalsIn(
      "../../../packages/sdk/src/config/provider-config.ts",
      /id: z\.literal\("(?!none")[a-z-]+"\)/g,
    );
    expect(PROVIDER_COUNT).toBe(literals);
  });

  it("lists the formats in the order of SUPPORTED_FORMATS", () => {
    const list = /export const SUPPORTED_FORMATS = \[([\s\S]*?)\] as const;/.exec(
      sourceOf("../../../packages/core/src/model/supported-format.ts"),
    )?.[1];
    expect(list).toBeDefined();
    expect(SUPPORTED_FORMAT_IDS).toEqual(quotedIn(list ?? ""));
  });

  it("lists the providers in the order of the sdk's providerFactories table", () => {
    const table = /const providerFactories: ProviderFactories = \{([\s\S]*?)\n\};/.exec(
      sourceOf("../../../packages/sdk/src/config/provider-config.ts"),
    )?.[1];
    expect(table).toBeDefined();
    const keys = [...(table ?? "").matchAll(/^ {2}"?([a-z-]+)"?:/gm)].map(([, key]) => key);
    expect(MACHINE_PROVIDER_IDS).toEqual(keys);
  });

  it("gives the hero four facts in digits, each linked to the page that owns it", () => {
    expect(HERO_FACTS).toEqual([
      { key: "version", value: `v${PACKAGE_VERSION}`, href: RELEASES_URL },
      { key: "license", value: "MIT", href: LICENSE_URL },
      { key: "formats", value: FORMAT_COUNT, path: "/docs/formats" },
      { key: "providers", value: PROVIDER_COUNT, path: "/docs/providers" },
    ]);
    expect(HERO_COUNT_FACTS.map((fact) => fact.key)).toEqual(["formats", "providers"]);
  });

  it("links each count to a docs page that exists", () => {
    for (const fact of HERO_COUNT_FACTS) {
      const page = fact.path.replace("/docs/", "");
      expect(() => sourceOf(`../content/docs/(configure)/${page}.mdx`)).not.toThrow();
    }
  });

  it("gives the social image its own three counts, the translated locales among them", () => {
    expect(TRANSLATED_LOCALE_COUNT).toBe(i18n.languages.length - 1);
    expect(OG_COUNT_FACTS).toEqual([
      { key: "formats", value: FORMAT_COUNT },
      { key: "providers", value: PROVIDER_COUNT },
      { key: "locales", value: TRANSLATED_LOCALE_COUNT },
    ]);
  });
});

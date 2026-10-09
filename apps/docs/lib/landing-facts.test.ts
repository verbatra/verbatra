import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FORMAT_COUNT,
  HERO_NUMBERS,
  MACHINE_PROVIDER_IDS,
  PROVIDER_COUNT,
  SUPPORTED_FORMAT_IDS,
  TRANSLATED_LOCALE_COUNT,
  VERSION_LINE,
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

  it("gives the hero three numbers: formats, providers and this site's translated locales", () => {
    expect(HERO_NUMBERS).toEqual([
      { key: "formats", value: FORMAT_COUNT },
      { key: "providers", value: PROVIDER_COUNT },
      { key: "locales", value: TRANSLATED_LOCALE_COUNT },
    ]);
  });

  it("counts exactly the target locales of this site's own verbatra config", () => {
    const block = /targetLocales: \[([^\]]*)\]/.exec(sourceOf("../verbatra.config.ts"))?.[1];
    expect(block).toBeDefined();
    expect(TRANSLATED_LOCALE_COUNT).toBe(quotedIn(block ?? "").length);
  });

  it("states the version and license as one plain line, with no release label", () => {
    expect(VERSION_LINE).toBe(`v${PACKAGE_VERSION}, MIT`);
    expect(VERSION_LINE).not.toContain("\u00b7");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import {
  FORMAT_COUNT,
  HERO_FACTS,
  LANDING_FACTS,
  MACHINE_PROVIDER_IDS,
  PROVIDER_COUNT,
  SUPPORTED_FORMAT_IDS,
} from "@/lib/landing-facts";

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

  it("ends the hero facts on the GitHub repository, linked to the one GitHub URL", () => {
    const last = HERO_FACTS.at(-1);
    expect(last?.key).toBe("github");
    expect(last?.href).toBe(GITHUB_URL);
    expect(HERO_FACTS.slice(0, -1)).toEqual(LANDING_FACTS);
  });

  it("keeps the GitHub row out of the social image facts", () => {
    expect(LANDING_FACTS.map((fact) => fact.key)).not.toContain("github");
  });
});

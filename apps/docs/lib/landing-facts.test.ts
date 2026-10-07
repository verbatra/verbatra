import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import { FORMAT_COUNT, HERO_FACTS, LANDING_FACTS, PROVIDER_COUNT } from "@/lib/landing-facts";

function literalsIn(relativePath: string, pattern: RegExp): number {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return readFileSync(path, "utf8").match(pattern)?.length ?? 0;
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

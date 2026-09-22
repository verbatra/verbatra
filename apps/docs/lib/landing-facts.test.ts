import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORMAT_COUNT, PROVIDER_COUNT } from "@/lib/landing-facts";

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
      /id: z\.literal\("[a-z-]+"\)/g,
    );
    expect(PROVIDER_COUNT).toBe(literals);
  });
});

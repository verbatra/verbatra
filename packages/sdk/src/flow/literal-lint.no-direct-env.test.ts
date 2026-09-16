import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_PATH = fileURLToPath(new URL("./literal-lint.ts", import.meta.url));

describe("static proof: the literal scan never reaches or reads a provider", () => {
  const content = readFileSync(SOURCE_PATH, "utf8");

  it("never references process.env", () => {
    expect(content).not.toContain("process.env");
  });

  it("never references the PROVIDER_ENV table", () => {
    expect(content).not.toContain("PROVIDER_ENV");
  });

  it("never calls selectProvider or constructs a provider", () => {
    expect(content).not.toContain("selectProvider(");
    expect(content).not.toContain("buildProvider(");
    expect(content).not.toContain("translateBatch(");
  });

  it("never writes through the file-system port", () => {
    expect(content).not.toMatch(/\.(writeFile|writeBytes|createExclusive|deleteFile|mkdir)\(/);
  });
});

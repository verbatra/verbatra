import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_PATHS = ["./unused-keys.ts", "./source-scan.ts"].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);

describe.each(SOURCE_PATHS)("static proof: %s never reaches or reads a provider", (path) => {
  const content = readFileSync(path, "utf8");

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

  it("never writes a file", () => {
    expect(content).not.toMatch(/\.write(File|Bytes)?\(/);
    expect(content).not.toContain("deleteFile(");
  });
});

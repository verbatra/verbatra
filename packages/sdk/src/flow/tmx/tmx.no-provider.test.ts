import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCES = ["import-tmx.ts", "export-tmx.ts", "locale-match.ts"] as const;

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

describe("static proof: TMX interchange never reaches a provider or a key", () => {
  it.each(SOURCES)("%s never references process.env", (name) => {
    expect(read(name)).not.toContain("process.env");
  });

  it.each(SOURCES)("%s never references the provider environment table", (name) => {
    expect(read(name)).not.toContain("PROVIDER_ENV");
  });

  it.each(SOURCES)("%s never builds or calls a provider", (name) => {
    const content = read(name);

    expect(content).not.toContain("selectProvider(");
    expect(content).not.toContain("buildProvider(");
    expect(content).not.toContain("translateBatch(");
  });

  it.each(SOURCES)("%s never imports the provider package", (name) => {
    expect(read(name)).not.toContain("@verbatra/ai-providers");
  });
});

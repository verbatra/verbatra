import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_FILES_PATTERN,
  PLAYGROUND_ITEMS,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_METADATA,
  PLAYGROUND_SOURCE_LOCALE,
  PLAYGROUND_TRANSLATIONS,
  playgroundFileName,
  playgroundGeneratedOn,
} from "./landing-playground";

function generatorSource(file: string): string {
  return readFileSync(new URL(`../scripts/playground/${file}`, import.meta.url), "utf8");
}

function constant(source: string, name: string): string {
  const match = new RegExp(`export const ${name} = ("?)([^";]+)\\1;`).exec(source);
  if (match?.[2] === undefined) throw new Error(`limits.ts declares no ${name}`);
  return match[2];
}

describe("the playground data matches the generator", () => {
  const limits = generatorSource("limits.ts");
  const run = generatorSource("run.ts");

  it("uses the generator's source locale, model, file pattern and provider", () => {
    expect(PLAYGROUND_SOURCE_LOCALE).toBe(constant(limits, "SOURCE_LOCALE"));
    expect(PLAYGROUND_METADATA.model).toBe(constant(limits, "MODEL"));
    expect(run).toContain(`files: { pattern: "${PLAYGROUND_FILES_PATTERN}" }`);
    expect(run).toContain(`id: "${PLAYGROUND_METADATA.provider}"`);
  });

  it("names a committed string as the default item, translated into every language", () => {
    expect(PLAYGROUND_ITEMS.map((item) => item.id)).toContain(PLAYGROUND_DEFAULT_ITEM);
    for (const code of PLAYGROUND_LANGUAGES) {
      expect(PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_DEFAULT_ITEM], code).toBeTruthy();
    }
  });
});

describe("playgroundFileName", () => {
  it("fills the locale into the committed file pattern and drops the folder", () => {
    expect(playgroundFileName("de")).toBe("de.json");
  });
});

describe("playgroundGeneratedOn", () => {
  it("formats the generation date in the reader's locale and keeps the ISO day", () => {
    const { iso, text } = playgroundGeneratedOn("en");
    expect(iso).toBe(PLAYGROUND_METADATA.generatedAt.slice(0, 10));
    expect(text).toMatch(/\d{4}/);
    expect(playgroundGeneratedOn("de").text).not.toBe(text);
  });
});

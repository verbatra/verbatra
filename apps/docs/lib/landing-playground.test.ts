import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_FILES_PATTERN,
  PLAYGROUND_FORMAT,
  PLAYGROUND_ITEMS,
  PLAYGROUND_KEPT_STRINGS,
  PLAYGROUND_MAX_OUTPUT_TOKENS,
  PLAYGROUND_METADATA,
  PLAYGROUND_PICK_IDS,
  PLAYGROUND_PICKS,
  PLAYGROUND_SENT_STRINGS,
  PLAYGROUND_SNIPPET,
  PLAYGROUND_SOURCE_LOCALE,
} from "./landing-playground";

function generatorSource(file: string): string {
  return readFileSync(new URL(`../scripts/playground/${file}`, import.meta.url), "utf8");
}

function constant(source: string, name: string): string {
  const match = new RegExp(`export const ${name} = ("?)([^";]+)\\1;`).exec(source);
  if (match?.[2] === undefined) throw new Error(`limits.ts declares no ${name}`);
  return match[2];
}

function configField(source: string, pattern: RegExp): string {
  const match = pattern.exec(source);
  if (match?.[1] === undefined) throw new Error(`run.ts has no ${pattern.source}`);
  return match[1];
}

describe("the displayed playground snippet matches the generator", () => {
  const limits = generatorSource("limits.ts");
  const run = generatorSource("run.ts");

  it("uses the generator's source locale, model and output token cap", () => {
    expect(PLAYGROUND_SOURCE_LOCALE).toBe(constant(limits, "SOURCE_LOCALE"));
    expect(PLAYGROUND_METADATA.model).toBe(constant(limits, "MODEL"));
    expect(PLAYGROUND_MAX_OUTPUT_TOKENS).toBe(Number(constant(limits, "MAX_OUTPUT_TOKENS")));
    expect(run).toContain("sourceLocale: SOURCE_LOCALE,");
    expect(run).toContain("model: MODEL, maxOutputTokens: MAX_OUTPUT_TOKENS");
  });

  it("uses the generator's format, file pattern and provider", () => {
    expect(PLAYGROUND_FORMAT).toBe(configField(run, /format: "([^"]+)"/));
    expect(PLAYGROUND_FILES_PATTERN).toBe(configField(run, /files: \{ pattern: "([^"]+)" \}/));
    expect(PLAYGROUND_METADATA.provider).toBe(configField(run, /provider: \{ id: "([^"]+)"/));
  });

  it("prints exactly those values", () => {
    for (const line of [
      `sourceLocale: "${PLAYGROUND_SOURCE_LOCALE}",`,
      `format: "${PLAYGROUND_FORMAT}",`,
      `files: { pattern: "${PLAYGROUND_FILES_PATTERN}" },`,
      `id: "${PLAYGROUND_METADATA.provider}",`,
      `options: { model: "${PLAYGROUND_METADATA.model}", maxOutputTokens: ${PLAYGROUND_MAX_OUTPUT_TOKENS} },`,
    ]) {
      expect(PLAYGROUND_SNIPPET).toContain(line);
    }
  });
});

describe("the animated picks", () => {
  it("name only strings that exist, each once, and include the default", () => {
    expect(PLAYGROUND_PICKS.map((pick) => pick.id)).toEqual([...PLAYGROUND_PICK_IDS]);
    expect(new Set(PLAYGROUND_PICK_IDS).size).toBe(PLAYGROUND_PICK_IDS.length);
    expect(PLAYGROUND_PICK_IDS).toContain(PLAYGROUND_DEFAULT_ITEM);
  });

  it("include a string without a placeholder and one with each placeholder kind", () => {
    const texts = PLAYGROUND_PICKS.map((pick) => pick.text);
    expect(texts.some((text) => !text.includes("{"))).toBe(true);
    expect(texts.some((text) => text.includes("{name}"))).toBe(true);
    expect(texts.some((text) => text.includes("{count}"))).toBe(true);
  });

  it("derive the kept count from the committed strings", () => {
    expect(PLAYGROUND_SENT_STRINGS + PLAYGROUND_KEPT_STRINGS).toBe(PLAYGROUND_ITEMS.length);
  });
});

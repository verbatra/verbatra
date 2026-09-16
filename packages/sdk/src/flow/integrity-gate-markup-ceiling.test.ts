import type { SupportedFormat, TranslationEntry } from "@verbatra/core";
import { createDefaultRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { gateCandidateValue } from "./integrity-gate.js";

function adapterFor(format: SupportedFormat): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format });
  if (resolution.status !== "resolved") {
    throw new Error(`no adapter resolved for ${format}`);
  }
  return resolution.adapter;
}

function entryFor(adapter: FormatAdapter, value: string): TranslationEntry {
  return {
    key: "docs",
    namespace: "en",
    value,
    placeholders: adapter.extractPlaceholders(value),
    isPlural: false,
  };
}

const PROSE = `Lorem ipsum dolor sit amet. ${"Filler sentence here. ".repeat(60)}`;

describe("the markup gate stops comparing only once the source exceeds the scanner's tag ceiling", () => {
  const adapter = adapterFor("i18next-json");

  it("refuses a flood that stays under the ceiling, dropped pair and invented tags alike", () => {
    const source = entryFor(adapter, `<b>${PROSE}</b>`);
    const candidate = `${PROSE}${"<i>x</i>".repeat(100)}`;

    expect(gateCandidateValue(source, candidate, adapter)).toMatchObject({
      accepted: false,
      reason: "markup",
    });
  });

  it("refuses the same shape once the flood crosses the ceiling, naming the limit", () => {
    const source = entryFor(adapter, `<b>${PROSE}</b>`);
    const candidate = `${PROSE}${"<i>x</i>".repeat(150)}`;

    expect(candidate.length / source.value.length).toBeLessThan(12);
    expect(gateCandidateValue(source, candidate, adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["+more than 256 inline tags"],
    });
  });

  it("refuses a flood of empty invented tags against a small source", () => {
    const source = entryFor(adapter, "<b>x</b>");

    expect(gateCandidateValue(source, `x${"<i></i>".repeat(200)}`, adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["+more than 256 inline tags"],
    });
  });

  it("accepts a total markup loss when the source itself crosses the ceiling", () => {
    const source = entryFor(adapter, `${"<b>a</b>".repeat(130)}<em>keep</em>`);

    expect(gateCandidateValue(source, "nichts hier", adapter).accepted).toBe(true);
  });

  it("still refuses the same loss when the source stays under the ceiling", () => {
    const source = entryFor(adapter, `${"<b>a</b>".repeat(120)}<em>keep</em>`);

    expect(gateCandidateValue(source, "nichts hier", adapter)).toMatchObject({
      accepted: false,
      reason: "markup",
    });
  });
});

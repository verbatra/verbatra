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

describe("the markup gate stops comparing once a value exceeds the scanner's tag ceiling", () => {
  const adapter = adapterFor("i18next-json");

  it("refuses a flood that stays under the ceiling, dropped pair and invented tags alike", () => {
    const source = entryFor(adapter, `<b>${PROSE}</b>`);
    const candidate = `${PROSE}${"<i>x</i>".repeat(100)}`;

    expect(gateCandidateValue(source, candidate, adapter)).toMatchObject({
      accepted: false,
      reason: "markup",
    });
  });

  it("accepts the same shape once the flood crosses the ceiling, which is the current fail-open", () => {
    const source = entryFor(adapter, `<b>${PROSE}</b>`);
    const candidate = `${PROSE}${"<i>x</i>".repeat(150)}`;

    expect(candidate.length / source.value.length).toBeLessThan(12);
    expect(gateCandidateValue(source, candidate, adapter).accepted).toBe(true);
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

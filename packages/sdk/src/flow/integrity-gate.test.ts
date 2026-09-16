import type { TranslationEntry } from "@verbatra/core";
import {
  createArbAdapter,
  createDefaultRegistry,
  createNextIntlJsonAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { gateCandidateValue } from "./integrity-gate.js";

function i18nextAdapter() {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("i18next adapter did not resolve");
  }
  return resolution.adapter;
}

function entry(value: string, placeholders: readonly string[] = []): TranslationEntry {
  return { key: "k", namespace: "en", value, placeholders, isPlural: false };
}

describe("gateCandidateValue: the accepted result carries its placeholder comparison", () => {
  const adapter = i18nextAdapter();

  it("surfaces a matched, in-order comparison so callers need not recompute it", () => {
    const result = gateCandidateValue(
      entry("Hello {{first}} {{last}}", ["{{first}}", "{{last}}"]),
      "Hallo {{first}} {{last}}",
      adapter,
    );
    expect(result).toEqual({
      accepted: true,
      integrity: { matches: true, missing: [], extra: [], reordered: false },
    });
  });

  it("surfaces a reordered comparison, which the gate accepts but review flags on", () => {
    const result = gateCandidateValue(
      entry("Hello {{first}} {{last}}", ["{{first}}", "{{last}}"]),
      "Hallo {{last}} {{first}}",
      adapter,
    );
    expect(result).toEqual({
      accepted: true,
      integrity: { matches: true, missing: [], extra: [], reordered: true },
    });
  });
});

describe("gateCandidateValue: placeholder-only formats", () => {
  const adapter = i18nextAdapter();

  it("accepts a candidate whose placeholders match the source", () => {
    const result = gateCandidateValue(
      entry("Hello {{name}}", ["{{name}}"]),
      "Hallo {{name}}",
      adapter,
    );
    expect(result).toMatchObject({ accepted: true });
  });

  it("rejects a candidate missing a source placeholder", () => {
    const result = gateCandidateValue(entry("Hello {{name}}", ["{{name}}"]), "Hallo", adapter);
    expect(result).toEqual({ accepted: false, reason: "placeholder" });
  });

  it("always accepts message validity for a non-ICU format regardless of content", () => {
    const result = gateCandidateValue(entry("Hello", []), "anything { unbalanced", adapter);
    expect(result).toMatchObject({ accepted: true });
  });

  it("rejects a placeholder-free, ICU-valid candidate that is a degenerate repetition loop", () => {
    const candidate = `//* ${"error: ".repeat(24)}[]`;
    const result = gateCandidateValue(entry("Something went wrong.", []), candidate, adapter);
    expect(result).toEqual({ accepted: false, reason: "degenerate" });
  });
});

describe("gateCandidateValue: ICU-capable formats (branch-aware comparePlaceholders + validateMessage)", () => {
  const adapter = createNextIntlJsonAdapter();

  it("rejects a placeholder invented in a single target branch before validateMessage ever runs", () => {
    const source = entry("{count, plural, one {# item} other {# items}}", ["{count}"]);
    const candidate = "{count, plural, one {# item} other {# items by {author}}}";
    const result = gateCandidateValue(source, candidate, adapter);
    expect(result).toEqual({ accepted: false, reason: "placeholder" });
  });

  it("accepts a well-formed ICU candidate whose branch-aware placeholders match", () => {
    const source = entry("{count, plural, one {One} other {# items}}", ["{count}"]);
    const candidate = "{count, plural, one {Eins} other {# Elemente}}";
    const result = gateCandidateValue(source, candidate, adapter);
    expect(result).toMatchObject({ accepted: true });
  });

  it("rejects a malformed ICU candidate that nonetheless matches on placeholders", () => {
    const source = entry("Hello world", []);
    const candidate = "Hallo {name";
    const result = gateCandidateValue(source, candidate, adapter);
    expect(result).toEqual({ accepted: false, reason: "icu" });
  });
});

describe("gateCandidateValue: an empty candidate for a non-empty source", () => {
  const adapter = i18nextAdapter();

  it("rejects an empty candidate for a placeholder-free source", () => {
    const result = gateCandidateValue(entry("Save", []), "", adapter);
    expect(result).toEqual({ accepted: false, reason: "empty" });
  });

  it.each(["   ", "\t", "\n", " \t\n "])(
    "rejects a whitespace-only candidate (%j)",
    (candidate) => {
      const result = gateCandidateValue(entry("Save", []), candidate, adapter);
      expect(result).toEqual({ accepted: false, reason: "empty" });
    },
  );

  it("still round-trips an empty translation of a source that is itself empty", () => {
    expect(gateCandidateValue(entry("", []), "", adapter)).toMatchObject({ accepted: true });
  });

  it("accepts an empty candidate for a whitespace-only source", () => {
    expect(gateCandidateValue(entry("   ", []), "", adapter)).toMatchObject({ accepted: true });
  });

  it("keeps reporting placeholder for an empty candidate whose source carries a placeholder", () => {
    const result = gateCandidateValue(entry("Hello {{name}}", ["{{name}}"]), "", adapter);
    expect(result).toEqual({ accepted: false, reason: "placeholder" });
  });
});

describe.each([
  ["next-intl", createNextIntlJsonAdapter],
  ["arb", createArbAdapter],
])("gateCandidateValue: empty candidates on the %s comparePlaceholders branch", (_name, make) => {
  const adapter = make();

  it("rejects an empty candidate for a placeholder-free source", () => {
    expect(gateCandidateValue(entry("Save", []), "", adapter)).toEqual({
      accepted: false,
      reason: "empty",
    });
  });

  it("rejects an empty candidate for a source that carries a placeholder", () => {
    const result = gateCandidateValue(entry("Hello {name}", ["{name}"]), "", adapter);
    expect(result.accepted).toBe(false);
  });

  it("rejects a whitespace-only candidate for a placeholder-free source", () => {
    expect(gateCandidateValue(entry("Save", []), "  ", adapter)).toEqual({
      accepted: false,
      reason: "empty",
    });
  });

  it("still round-trips an empty translation of an empty source", () => {
    expect(gateCandidateValue(entry("", []), "", adapter)).toMatchObject({ accepted: true });
  });
});

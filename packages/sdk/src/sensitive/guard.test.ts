import type { LocaleGlossary } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { SensitiveDataConfig } from "../config/sensitive-config.js";
import { baseConfig } from "../test-support.js";
import { createSensitiveGuard, type SensitiveGuard, sensitiveGuardFor } from "./guard.js";

function entry(overrides: Partial<TranslationEntry> = {}): TranslationEntry {
  return {
    key: "contact",
    namespace: "",
    value: "Write to a@acme.io",
    placeholders: [],
    isPlural: false,
    ...overrides,
  };
}

function guard(config: SensitiveDataConfig, kind: "llm" | "machine-translation" = "llm") {
  const created = createSensitiveGuard(config, kind);
  if (created === undefined) {
    throw new Error("expected a guard");
  }
  return created;
}

const GLOSSARY: LocaleGlossary = {
  terms: [
    { source: "Falcon", target: "Falke", forbidden: [], caseSensitive: false },
    { source: "account", target: "Konto", forbidden: [], caseSensitive: false },
  ],
  doNotTranslate: [
    { term: "ops@acme.io", caseSensitive: true },
    { term: "Acme", caseSensitive: true },
  ],
};

describe("createSensitiveGuard", () => {
  it("is off when the block is absent or its mode is off", () => {
    expect(createSensitiveGuard(undefined, "llm")).toBe(undefined);
    expect(createSensitiveGuard({ mode: "off" }, "llm")).toBe(undefined);
  });

  it("runs the default detectors only: secret, email, iban and credit-card", () => {
    const warn = guard({ mode: "warn" });

    expect(warn.entry(entry({ value: "Call +4930123456789 at 10.0.0.1" }))).toEqual({
      action: "send",
    });
    expect(warn.entry(entry())).toEqual({
      action: "send",
      finding: { fields: ["value"], sources: ["email"] },
    });
  });

  it("runs only the configured detectors and patterns", () => {
    const custom = guard({ mode: "warn", detectors: ["phone"], patterns: ["Falcon"] });

    expect(custom.entry(entry()).finding).toBe(undefined);
    expect(custom.entry(entry({ value: "Falcon on +4930123456789" })).finding?.sources).toEqual([
      "pattern",
      "phone",
    ]);
  });
});

describe("the entry verdict", () => {
  it("warn sends the entry unchanged and records the finding", () => {
    expect(guard({ mode: "warn" }).entry(entry()).action).toBe("send");
  });

  it("block withholds an entry with any finding and sends a clean one", () => {
    const block = guard({ mode: "block" });

    expect(block.entry(entry()).action).toBe("withhold");
    expect(block.entry(entry({ value: "Hello" }))).toEqual({ action: "send" });
  });

  it("redact replaces value matches with tokens and context matches with a fixed text", () => {
    const verdict = guard({ mode: "redact" }).entry(
      entry({
        value: "Hi {{name}}, write to a@acme.io",
        placeholders: ["{{name}}"],
        description: "Shown to b@acme.io",
        meaning: "support c@acme.io",
      }),
    );

    expect(verdict).toEqual({
      action: "redact",
      finding: { fields: ["value", "description", "meaning"], sources: ["email"] },
      entry: entry({
        value: "Hi {{name}}, write to __VBR0__",
        placeholders: ["{{name}}", "__VBR0__"],
        description: "Shown to [redacted]",
        meaning: "support [redacted]",
      }),
      originals: ["a@acme.io"],
    });
  });

  it("redact adds no placeholder when only the description matches", () => {
    const verdict = guard({ mode: "redact" }).entry(
      entry({ value: "Hello", description: "Ask a@acme.io" }),
    );

    expect(verdict.action === "redact" && verdict.entry).toEqual(
      entry({ value: "Hello", description: "Ask [redacted]" }),
    );
  });

  it("redact withholds a key whose name matches, since a key name cannot be replaced", () => {
    expect(guard({ mode: "redact" }).entry(entry({ key: "a@acme.io", value: "Hi" })).action).toBe(
      "withhold",
    );
  });

  it("redact withholds a value that already holds a token", () => {
    expect(guard({ mode: "redact" }).entry(entry({ value: "__VBR0__ a@acme.io" })).action).toBe(
      "withhold",
    );
  });

  it("an MT provider's guard scans the value only, since nothing else is sent", () => {
    const mt = guard({ mode: "block" }, "machine-translation");

    expect(mt.scansEveryField).toBe(false);
    expect(mt.entry(entry({ key: "a@acme.io", value: "Hi", description: "b@acme.io" }))).toEqual({
      action: "send",
    });
  });

  it("decides each entry once and hands back the same verdict", () => {
    const block = guard({ mode: "block" });
    const scanned = entry();

    expect(block.entry(scanned)).toBe(block.entry(scanned));
  });
});

describe("the glossary verdict", () => {
  function verdictOf(sensitive: SensitiveGuard, glossary: LocaleGlossary | undefined) {
    return sensitive.glossary(glossary);
  }

  it("is empty without a glossary", () => {
    expect(verdictOf(guard({ mode: "block" }), undefined)).toEqual({
      flagged: 0,
      sources: [],
      send: undefined,
    });
  });

  it("warn keeps every term and counts the flagged ones", () => {
    const verdict = verdictOf(guard({ mode: "warn", patterns: ["Falcon"] }), GLOSSARY);

    expect(verdict.flagged).toBe(2);
    expect(verdict.sources).toEqual(["email", "pattern"]);
    expect(verdict.send).toBe(GLOSSARY);
  });

  it("block and redact drop the flagged terms from the request", () => {
    for (const mode of ["block", "redact"] as const) {
      const verdict = verdictOf(guard({ mode, patterns: ["Falcon"] }), GLOSSARY);

      expect(verdict.send).toEqual({
        terms: [GLOSSARY.terms[1]],
        doNotTranslate: [GLOSSARY.doNotTranslate[1]],
      });
    }
  });

  it("hands back the glossary itself when nothing matched, and remembers its verdict", () => {
    const block = guard({ mode: "block", detectors: ["iban"] });

    expect(verdictOf(block, GLOSSARY).send).toBe(GLOSSARY);
    expect(verdictOf(block, GLOSSARY)).toBe(verdictOf(block, GLOSSARY));
  });

  it("is never scanned for an MT provider, which does not receive it", () => {
    expect(verdictOf(guard({ mode: "block" }, "machine-translation"), GLOSSARY)).toEqual({
      flagged: 0,
      sources: [],
      send: GLOSSARY,
    });
  });
});

describe("sensitiveGuardFor", () => {
  it("builds the guard for the configured provider's kind", () => {
    const config = baseConfig({ sensitiveData: { mode: "block" } });

    expect(sensitiveGuardFor(config)?.scansEveryField).toBe(true);
    expect(
      sensitiveGuardFor({
        ...config,
        provider: { id: "deepl", options: {} },
      })?.scansEveryField,
    ).toBe(false);
  });

  it("builds none for provider none, which sends nothing", () => {
    expect(
      sensitiveGuardFor(
        baseConfig({ sensitiveData: { mode: "block" }, provider: { id: "none", options: {} } }),
      ),
    ).toBe(undefined);
  });
});

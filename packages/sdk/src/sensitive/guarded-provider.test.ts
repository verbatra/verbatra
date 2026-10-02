import type {
  LocaleGlossary,
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { SensitiveDataConfig } from "../config/sensitive-config.js";
import { makeStubProvider } from "../test-support.js";
import { createSensitiveGuard, type SensitiveGuard } from "./guard.js";
import { guardProvider, sensitiveWithheldOf } from "./guarded-provider.js";

function entry(
  key: string,
  value: string,
  extra: Partial<TranslationEntry> = {},
): TranslationEntry {
  return { key, namespace: "", value, placeholders: [], isPlural: false, ...extra };
}

function guard(config: SensitiveDataConfig): SensitiveGuard {
  const created = createSensitiveGuard(config, "llm");
  if (created === undefined) {
    throw new Error("expected a guard");
  }
  return created;
}

const GLOSSARY: LocaleGlossary = {
  terms: [{ source: "Falcon", target: "Falke", forbidden: [], caseSensitive: false }],
  doNotTranslate: [],
};

function request(entries: readonly TranslationEntry[]): TranslateRequest {
  return {
    sourceLocale: "en",
    targetLocale: "de",
    entries,
    glossary: GLOSSARY,
    extractPlaceholders: () => [],
  };
}

const ENTRIES = [
  entry("contact", "Write to a@acme.io"),
  entry("plain", "Hello"),
  entry("a@acme.io", "Key name"),
];

function sentText(stub: ReturnType<typeof makeStubProvider>): string {
  return JSON.stringify(stub.calls.map((call) => call.request));
}

describe("guardProvider", () => {
  it("passes the provider's identity through", () => {
    const stub = makeStubProvider({ id: "deepl", kind: "machine-translation" });
    const guarded = guardProvider(stub.provider, guard({ mode: "warn" }));

    expect([guarded.id, guarded.kind, guarded.supportsGlossary]).toEqual([
      "deepl",
      "machine-translation",
      true,
    ]);
  });

  it("warn sends every entry and the glossary unchanged", async () => {
    const stub = makeStubProvider();
    const sent = request(ENTRIES);
    await guardProvider(
      stub.provider,
      guard({ mode: "warn", patterns: ["Falcon"] }),
    ).translateBatch(sent);

    expect(stub.calls[0]?.request.entries).toEqual(ENTRIES);
    expect(stub.calls[0]?.request.glossary).toBe(GLOSSARY);
  });

  it("block sends nothing for a flagged key and drops a flagged glossary term", async () => {
    const stub = makeStubProvider();
    const result = await guardProvider(
      stub.provider,
      guard({ mode: "block", patterns: ["Falcon"] }),
    ).translateBatch(request(ENTRIES));

    expect(stub.calls[0]?.request.entries.map((sent) => sent.key)).toEqual(["plain"]);
    expect(stub.calls[0]?.request.glossary).toEqual({ terms: [], doNotTranslate: [] });
    expect(sentText(stub)).not.toContain("acme.io");
    expect([...result.values.keys()]).toEqual(["plain"]);
  });

  it("sends no request at all when every entry is withheld", async () => {
    const stub = makeStubProvider();
    const result = await guardProvider(stub.provider, guard({ mode: "block" })).translateBatch(
      request([ENTRIES[0] as TranslationEntry]),
    );

    expect(stub.calls).toHaveLength(0);
    expect(result.values.size).toBe(0);
  });

  it("redact sends no matched text and restores it byte for byte", async () => {
    const stub = makeStubProvider();
    const result = await guardProvider(stub.provider, guard({ mode: "redact" })).translateBatch(
      request(ENTRIES),
    );

    expect(sentText(stub)).not.toContain("a@acme.io");
    expect(stub.calls[0]?.request.entries.map((sent) => sent.value)).toEqual([
      "Write to __VBR0__",
      "Hello",
    ]);
    expect(result.values.get("contact")).toBe("[de] Write to a@acme.io");
    expect(result.integrity.has("contact")).toBe(true);
  });

  it.each([
    ["dropped", (value: string) => value.replace("__VBR0__", "")],
    ["duplicated", (value: string) => `${value} ${value}`],
    ["rewritten", (value: string) => value.replace("__VBR0__", "__vbr0__")],
  ])("redact withholds a key whose token came back %s", async (_name, change) => {
    const stub = makeStubProvider({ translate: (value) => change(value) });
    const result = await guardProvider(stub.provider, guard({ mode: "redact" })).translateBatch(
      request(ENTRIES.slice(0, 2)),
    );

    expect(result.values.has("contact")).toBe(false);
    expect(result.integrity.has("contact")).toBe(false);
    expect(result.reviewFlags?.has("contact")).toBe(false);
    expect(result.values.get("plain")).toBe(change("Hello"));
  });

  it("decides each entry once: a pre-scanned verdict and a fail-safe scan send the same request", async () => {
    for (const mode of ["warn", "block", "redact"] as const) {
      const prescanned = guard({ mode, patterns: ["Falcon"] });
      for (const scanned of ENTRIES) {
        prescanned.entry(scanned);
      }
      prescanned.glossary(GLOSSARY);
      const first = makeStubProvider();
      const second = makeStubProvider();
      await guardProvider(first.provider, prescanned).translateBatch(request(ENTRIES));
      await guardProvider(second.provider, guard({ mode, patterns: ["Falcon"] })).translateBatch(
        request(ENTRIES),
      );

      expect(sentText(first), mode).toBe(sentText(second));
    }
  });

  it("keeps a result without review flags readable", async () => {
    const inner: TranslationProvider = {
      id: "x",
      kind: "llm",
      supportsGlossary: false,
      translateBatch: async (sent): Promise<TranslateResult> => ({
        values: new Map(sent.entries.map((item) => [item.key, item.value])),
        integrity: new Map(),
      }),
    };
    const { glossary: _glossary, ...bare } = request([ENTRIES[1] as TranslationEntry]);
    const result = await guardProvider(inner, guard({ mode: "redact" })).translateBatch(bare);

    expect(result.values.get("plain")).toBe("Hello");
  });

  it("records the keys it withheld or could not restore, and nothing else", async () => {
    const stub = makeStubProvider({
      missingValues: new Set(["plain"]),
      translate: (value) => value.replace("__VBR0__", ""),
    });
    const result = await guardProvider(stub.provider, guard({ mode: "redact" })).translateBatch(
      request([...ENTRIES, entry("other", "Mail b@acme.io")]),
    );

    expect([...sensitiveWithheldOf(result).entries()]).toEqual([
      ["a@acme.io", ["email"]],
      ["contact", ["email"]],
      ["other", ["email"]],
    ]);
    expect(result.values.has("plain")).toBe(false);
  });

  it("records nothing for a result it did not produce", () => {
    expect(sensitiveWithheldOf({ values: new Map(), integrity: new Map() }).size).toBe(0);
  });
});

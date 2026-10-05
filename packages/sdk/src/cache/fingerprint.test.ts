import { stableStringHash } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig } from "../test-support.js";
import { computeFingerprint } from "./fingerprint.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig => baseConfig(overrides);

describe("computeFingerprint", () => {
  it("is a 16-character hex digest, stable for the same config", () => {
    expect(computeFingerprint(cfg(), "de")).toMatch(/^[0-9a-f]{16}$/);
    expect(computeFingerprint(cfg(), "de")).toBe(computeFingerprint(cfg(), "de"));
  });

  it("changes when the tone changes", () => {
    expect(computeFingerprint(cfg({ tone: "formal" }), "de")).not.toBe(
      computeFingerprint(cfg({ tone: "informal" }), "de"),
    );
  });

  it("changes when the model changes", () => {
    const a = cfg({ provider: { id: "anthropic", options: { model: "m1", maxTokens: 256 } } });
    const b = cfg({ provider: { id: "anthropic", options: { model: "m2", maxTokens: 256 } } });
    expect(computeFingerprint(a, "de")).not.toBe(computeFingerprint(b, "de"));
  });

  it("gives human-only mode its own stable fingerprint, apart from every machine provider", () => {
    const none = cfg({ provider: { id: "none", options: {} } });
    expect(computeFingerprint(none, "de")).toMatch(/^[0-9a-f]{16}$/);
    expect(computeFingerprint(none, "de")).not.toBe(computeFingerprint(cfg(), "de"));
  });

  it("keeps the human-only fingerprint when tone or glossary change, so human work stays reusable", () => {
    const none = cfg({ provider: { id: "none", options: {} } });
    const edited = cfg({
      provider: { id: "none", options: {} },
      tone: "formal",
      glossary: { Account: "Konto" },
    });
    expect(computeFingerprint(edited, "de")).toBe(computeFingerprint(none, "de"));
  });

  it("changes when the provider id changes", () => {
    const anthropic = cfg();
    const deepl = cfg({ provider: { id: "deepl", options: {} } });
    expect(computeFingerprint(anthropic, "de")).not.toBe(computeFingerprint(deepl, "de"));
  });

  it("treats a model-less provider (DeepL) as a null model without throwing", () => {
    expect(computeFingerprint(cfg({ provider: { id: "deepl", options: {} } }), "de")).toMatch(
      /^[0-9a-f]{16}$/,
    );
  });

  it("does not depend on glossary key order", () => {
    const a = cfg({ glossary: { alpha: "A", beta: "B" } });
    const b = cfg({ glossary: { beta: "B", alpha: "A" } });
    expect(computeFingerprint(a, "de")).toBe(computeFingerprint(b, "de"));
  });

  it("changes when the glossary content changes", () => {
    expect(computeFingerprint(cfg({ glossary: { alpha: "A" } }), "de")).not.toBe(
      computeFingerprint(cfg({ glossary: { alpha: "Z" } }), "de"),
    );
  });

  it("distinguishes an absent glossary from an empty one only by staying stable", () => {
    expect(computeFingerprint(cfg(), "de")).toBe(computeFingerprint(cfg({ glossary: {} }), "de"));
  });
});

describe("computeFingerprint: provider localeMap", () => {
  const deepl = (options: { localeMap?: Record<string, string> } = {}): VerbatraConfig =>
    cfg({ provider: { id: "deepl", options } });

  it("keeps the fingerprint of a config without a localeMap unchanged", () => {
    const withoutLocaleMap = JSON.stringify({
      provider: "deepl",
      model: null,
      tone: null,
      glossary: {},
    });
    expect(computeFingerprint(deepl(), "de")).toBe(stableStringHash(withoutLocaleMap));
  });

  it("treats an empty localeMap like an absent one", () => {
    expect(computeFingerprint(deepl({ localeMap: {} }), "de")).toBe(
      computeFingerprint(deepl(), "de"),
    );
  });

  it("changes when a non-empty localeMap is added or changed", () => {
    const base = computeFingerprint(deepl(), "de");
    const mapped = computeFingerprint(deepl({ localeMap: { "es-MX": "ES-419" } }), "de");
    const remapped = computeFingerprint(deepl({ localeMap: { "es-MX": "ES" } }), "de");
    expect(mapped).not.toBe(base);
    expect(remapped).not.toBe(mapped);
  });

  it("ignores the order of the localeMap keys", () => {
    const ab = computeFingerprint(deepl({ localeMap: { de: "DE", fr: "FR" } }), "de");
    const ba = computeFingerprint(deepl({ localeMap: { fr: "FR", de: "DE" } }), "de");
    expect(ab).toBe(ba);
  });
});

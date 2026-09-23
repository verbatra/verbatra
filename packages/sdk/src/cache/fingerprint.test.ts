import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig } from "../test-support.js";
import { computeFingerprint } from "./fingerprint.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig => baseConfig(overrides);

describe("computeFingerprint", () => {
  it("is a 16-character hex digest, stable for the same config", () => {
    expect(computeFingerprint(cfg())).toMatch(/^[0-9a-f]{16}$/);
    expect(computeFingerprint(cfg())).toBe(computeFingerprint(cfg()));
  });

  it("changes when the tone changes", () => {
    expect(computeFingerprint(cfg({ tone: "formal" }))).not.toBe(
      computeFingerprint(cfg({ tone: "informal" })),
    );
  });

  it("changes when the model changes", () => {
    const a = cfg({ provider: { id: "anthropic", options: { model: "m1", maxTokens: 256 } } });
    const b = cfg({ provider: { id: "anthropic", options: { model: "m2", maxTokens: 256 } } });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it("gives human-only mode its own stable fingerprint, apart from every machine provider", () => {
    const none = cfg({ provider: { id: "none", options: {} } });
    expect(computeFingerprint(none)).toMatch(/^[0-9a-f]{16}$/);
    expect(computeFingerprint(none)).not.toBe(computeFingerprint(cfg()));
  });

  it("keeps the human-only fingerprint when tone or glossary change, so human work stays reusable", () => {
    const none = cfg({ provider: { id: "none", options: {} } });
    const edited = cfg({
      provider: { id: "none", options: {} },
      tone: "formal",
      glossary: { Account: "Konto" },
    });
    expect(computeFingerprint(edited)).toBe(computeFingerprint(none));
  });

  it("changes when the provider id changes", () => {
    const anthropic = cfg();
    const deepl = cfg({ provider: { id: "deepl", options: {} } });
    expect(computeFingerprint(anthropic)).not.toBe(computeFingerprint(deepl));
  });

  it("treats a model-less provider (DeepL) as a null model without throwing", () => {
    expect(computeFingerprint(cfg({ provider: { id: "deepl", options: {} } }))).toMatch(
      /^[0-9a-f]{16}$/,
    );
  });

  it("does not depend on glossary key order", () => {
    const a = cfg({ glossary: { alpha: "A", beta: "B" } });
    const b = cfg({ glossary: { beta: "B", alpha: "A" } });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("changes when the glossary content changes", () => {
    expect(computeFingerprint(cfg({ glossary: { alpha: "A" } }))).not.toBe(
      computeFingerprint(cfg({ glossary: { alpha: "Z" } })),
    );
  });

  it("distinguishes an absent glossary from an empty one only by staying stable", () => {
    expect(computeFingerprint(cfg())).toBe(computeFingerprint(cfg({ glossary: {} })));
  });
});

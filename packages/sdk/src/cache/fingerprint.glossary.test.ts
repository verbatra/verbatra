import { stableStringHash } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { GlossaryDefinition } from "../config/glossary.js";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig } from "../test-support.js";
import { computeFingerprint, fingerprintsFor } from "./fingerprint.js";

function deepl(glossary: VerbatraConfig["glossary"]): VerbatraConfig {
  return baseConfig({
    targetLocales: ["de", "fr"],
    provider: { id: "deepl", options: {} },
    ...(glossary !== undefined ? { glossary } : {}),
  });
}

const PER_LOCALE: GlossaryDefinition = {
  version: 2,
  terms: [{ source: "Dashboard", targets: { de: "Übersicht", fr: "Tableau de bord" } }],
};

describe("computeFingerprint: a version 1 glossary", () => {
  it("keeps the fingerprint every earlier release computed, so no cached translation is lost", () => {
    const legacy = JSON.stringify({
      provider: "deepl",
      model: null,
      tone: null,
      glossary: { Account: "Konto", Save: "Speichern" },
    });
    const config = deepl({ Save: "Speichern", Account: "Konto" });
    expect(stableStringHash(legacy)).toBe("10e47a4574f3d37d");
    expect(computeFingerprint(config, "de")).toBe("10e47a4574f3d37d");
    expect(computeFingerprint(config, "fr")).toBe("10e47a4574f3d37d");
  });

  it("matches the same terms written as a version 2 glossary with global translations", () => {
    const v2: GlossaryDefinition = {
      version: 2,
      terms: [
        { source: "Save", target: "Speichern" },
        { source: "Account", target: "Konto", caseSensitive: true },
      ],
    };
    expect(computeFingerprint(deepl(v2), "de")).toBe(
      computeFingerprint(deepl({ Account: "Konto", Save: "Speichern" }), "de"),
    );
  });
});

describe("computeFingerprint: per-locale glossary slices", () => {
  it("leaves the French fingerprint alone when only the German translation changes", () => {
    const edited: GlossaryDefinition = {
      version: 2,
      terms: [{ source: "Dashboard", targets: { de: "Startseite", fr: "Tableau de bord" } }],
    };
    expect(computeFingerprint(deepl(edited), "fr")).toBe(
      computeFingerprint(deepl(PER_LOCALE), "fr"),
    );
    expect(computeFingerprint(deepl(edited), "de")).not.toBe(
      computeFingerprint(deepl(PER_LOCALE), "de"),
    );
  });

  it.each([
    ["a forbidden rendering", { forbidden: { de: ["Instrumententafel"] } }],
    ["a note", { note: "The start page" }],
    ["a part of speech", { partOfSpeech: "noun" }],
  ])("changes when %s is added, since the provider receives it", (_label, extra) => {
    const extended: GlossaryDefinition = {
      version: 2,
      terms: [{ ...PER_LOCALE.terms[0], source: "Dashboard", ...extra }],
    };
    expect(computeFingerprint(deepl(extended), "de")).not.toBe(
      computeFingerprint(deepl(PER_LOCALE), "de"),
    );
  });

  it("changes when a do-not-translate term is added", () => {
    expect(
      computeFingerprint(deepl({ ...PER_LOCALE, doNotTranslate: ["verbatra"] }), "de"),
    ).not.toBe(computeFingerprint(deepl(PER_LOCALE), "de"));
  });

  it("ignores case sensitivity, which only changes the review checks", () => {
    const sensitive: GlossaryDefinition = {
      version: 2,
      terms: [{ ...PER_LOCALE.terms[0], source: "Dashboard", caseSensitive: true }],
      doNotTranslate: [{ term: "verbatra", caseSensitive: false }],
    };
    const insensitive: GlossaryDefinition = { ...PER_LOCALE, doNotTranslate: ["verbatra"] };
    expect(computeFingerprint(deepl(sensitive), "de")).toBe(
      computeFingerprint(deepl(insensitive), "de"),
    );
  });

  it("does not depend on the order terms or renderings are written in", () => {
    const a: GlossaryDefinition = {
      version: 2,
      terms: [
        { source: "B", forbidden: { de: ["x", "y"] } },
        { source: "A", target: "Ä" },
      ],
      doNotTranslate: ["q", "p"],
    };
    const b: GlossaryDefinition = {
      version: 2,
      terms: [
        { source: "A", target: "Ä" },
        { source: "B", forbidden: { de: ["y", "x"] } },
      ],
      doNotTranslate: ["p", "q"],
    };
    expect(computeFingerprint(deepl(a), "de")).toBe(computeFingerprint(deepl(b), "de"));
  });
});

describe("fingerprintsFor", () => {
  it("computes each locale's fingerprint once and returns the same value on every call", () => {
    const config = deepl(PER_LOCALE);
    const fingerprintFor = fingerprintsFor(config);
    expect(fingerprintFor("de")).toBe(computeFingerprint(config, "de"));
    expect(fingerprintFor("de")).toBe(fingerprintFor("de"));
    expect(fingerprintFor("fr")).not.toBe(fingerprintFor("de"));
  });
});

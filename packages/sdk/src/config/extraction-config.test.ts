import { describe, expect, it } from "vitest";
import {
  buildExtractor,
  buildLiteralRules,
  EXTRACTION_FRAMEWORKS,
  extractionConfigSchema,
} from "./extraction-config.js";

describe("extractionConfigSchema", () => {
  it("accepts a framework and at least one root", () => {
    const parsed = extractionConfigSchema.parse({ framework: "i18next", roots: ["src"] });

    expect(parsed).toEqual({ framework: "i18next", roots: ["src"] });
  });

  it("accepts an exclude list", () => {
    const parsed = extractionConfigSchema.parse({
      framework: "i18next",
      roots: ["src"],
      exclude: ["generated"],
    });

    expect(parsed.exclude).toEqual(["generated"]);
  });

  it("accepts an unused.ignore list of keys and wildcard patterns", () => {
    const parsed = extractionConfigSchema.parse({
      framework: "i18next",
      roots: ["src"],
      unused: { ignore: ["emails.*", "cms.banner"] },
    });

    expect(parsed.unused?.ignore).toEqual(["emails.*", "cms.banner"]);
  });

  it("rejects an empty unused.ignore entry, which could only ever match an empty key", () => {
    expect(
      extractionConfigSchema.safeParse({
        framework: "i18next",
        roots: ["src"],
        unused: { ignore: [""] },
      }).success,
    ).toBe(false);
  });

  it("rejects the old top-level ignoreUnused spelling and an unknown unused field", () => {
    expect(
      extractionConfigSchema.safeParse({ framework: "i18next", roots: ["src"], ignoreUnused: [] })
        .success,
    ).toBe(false);
    expect(
      extractionConfigSchema.safeParse({
        framework: "i18next",
        roots: ["src"],
        unused: { skip: [] },
      }).success,
    ).toBe(false);
  });

  it("rejects an empty roots list, because a scan with no root can only find nothing", () => {
    expect(extractionConfigSchema.safeParse({ framework: "i18next", roots: [] }).success).toBe(
      false,
    );
  });

  it("rejects an unrecognized key rather than ignoring it", () => {
    expect(
      extractionConfigSchema.safeParse({ framework: "i18next", roots: ["src"], depth: 2 }).success,
    ).toBe(false);
  });

  it("rejects a framework with no extractor", () => {
    expect(
      extractionConfigSchema.safeParse({ framework: "vue-i18n", roots: ["src"] }).success,
    ).toBe(false);
  });
});

describe("buildExtractor", () => {
  it("resolves every framework in the closed union to an extractor for that framework", () => {
    for (const framework of EXTRACTION_FRAMEWORKS) {
      expect(buildExtractor(framework).framework).toBe(framework);
    }
  });

  it("lists at least one framework, so the loop above cannot pass vacuously", () => {
    expect(EXTRACTION_FRAMEWORKS.length).toBeGreaterThanOrEqual(1);
  });
});

describe("extractionConfigSchema: the literals block", () => {
  it("accepts an ignore list", () => {
    const parsed = extractionConfigSchema.parse({
      framework: "i18next",
      roots: ["src"],
      literals: { ignore: ["Acme Inc."] },
    });

    expect(parsed.literals).toEqual({ ignore: ["Acme Inc."] });
  });

  it("rejects an unrecognized key and an empty entry", () => {
    const base = { framework: "i18next", roots: ["src"] };

    expect(extractionConfigSchema.safeParse({ ...base, literals: { allow: [] } }).success).toBe(
      false,
    );
    expect(extractionConfigSchema.safeParse({ ...base, literals: { ignore: [""] } }).success).toBe(
      false,
    );
  });
});

describe("buildLiteralRules", () => {
  it("resolves every framework to rules that recognise its translation calls", () => {
    for (const framework of EXTRACTION_FRAMEWORKS) {
      const rules = buildLiteralRules(framework);

      expect(rules.calleeNames.size).toBeGreaterThan(0);
      expect(rules.extensions).toEqual(buildExtractor(framework).extensions);
    }
  });
});

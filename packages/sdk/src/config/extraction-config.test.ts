import { describe, expect, it } from "vitest";
import {
  buildExtractor,
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

  it("accepts an ignoreUnused list of keys and wildcard patterns", () => {
    const parsed = extractionConfigSchema.parse({
      framework: "i18next",
      roots: ["src"],
      ignoreUnused: ["emails.*", "cms.banner"],
    });

    expect(parsed.ignoreUnused).toEqual(["emails.*", "cms.banner"]);
  });

  it("rejects an empty ignoreUnused entry, which could only ever match an empty key", () => {
    expect(
      extractionConfigSchema.safeParse({ framework: "i18next", roots: ["src"], ignoreUnused: [""] })
        .success,
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

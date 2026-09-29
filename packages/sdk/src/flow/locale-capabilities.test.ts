import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { baseConfig } from "../test-support.js";
import {
  assertConfiguredLocalesSupported,
  assessLocaleCapabilities,
  type LocaleCapability,
  type LocaleCapabilityReport,
  unsupportedLocales,
  withCapabilityNotices,
} from "./locale-capabilities.js";
import { failureSummary } from "./locale-failure.js";

const DEEPL: ProviderConfig = { id: "deepl", options: {} };
const GOOGLE: ProviderConfig = { id: "google-translate", options: {} };

function deeplConfig(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return baseConfig({ provider: DEEPL, ...overrides });
}

function reportOf(config: VerbatraConfig, locales = config.targetLocales): LocaleCapabilityReport {
  const report = assessLocaleCapabilities(config, locales);
  if (report === undefined) {
    throw new Error("expected a report");
  }
  return report;
}

function entryOf(report: LocaleCapabilityReport, locale: string): LocaleCapability {
  const entry = report.locales.find((candidate) => candidate.locale === locale);
  if (entry === undefined) {
    throw new Error(`no entry for ${locale}`);
  }
  return entry;
}

function warningCodes(entry: { readonly warnings: readonly { readonly code: string }[] }) {
  return entry.warnings.map((warning) => warning.code);
}

async function refusalOf(run: () => unknown): Promise<SdkError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof SdkError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("assessLocaleCapabilities: DeepL", () => {
  it("reports the code each locale is sent as and what DeepL supports for it", () => {
    const report = reportOf(deeplConfig({ targetLocales: ["de", "pt-BR", "zh-TW", "th"] }));

    expect(report).toMatchObject({
      provider: "deepl",
      coverage: "listed",
      tableVersion: "2026-09-28",
      tableOrigin: "static",
      source: { locale: "en", providerCode: "EN", mapped: false, support: "supported" },
    });
    expect(entryOf(report, "de")).toEqual({
      locale: "de",
      providerCode: "DE",
      mapped: false,
      support: "supported",
      glossary: true,
      formality: true,
      warnings: [],
    });
    expect(entryOf(report, "pt-BR")).toMatchObject({ providerCode: "PT-BR", formality: true });
    expect(entryOf(report, "zh-TW")).toMatchObject({
      providerCode: "ZH-HANT",
      glossary: true,
      formality: false,
    });
    expect(entryOf(report, "th")).toMatchObject({ support: "supported", glossary: false });
  });

  it("marks a language DeepL does not list, and the bare English target, unsupported", () => {
    const report = reportOf(deeplConfig({ sourceLocale: "de", targetLocales: ["en", "chr"] }));

    expect(entryOf(report, "en")).toMatchObject({
      providerCode: "EN",
      support: "unsupported",
      glossary: false,
      formality: false,
      warnings: [],
    });
    expect(entryOf(report, "chr").support).toBe("unsupported");
    expect(unsupportedLocales(report)).toEqual(["en", "chr"]);
  });

  it("marks an unlisted source language unsupported", () => {
    const report = reportOf(deeplConfig({ sourceLocale: "chr", targetLocales: ["de"] }));

    expect(report.source.support).toBe("unsupported");
    expect(unsupportedLocales(report)).toEqual(["chr"]);
  });

  it("trusts an explicit localeMap entry as unverified rather than refusing it", () => {
    const config = deeplConfig({
      sourceLocale: "en-US",
      targetLocales: ["chr"],
      provider: { id: "deepl", options: { localeMap: { chr: "CHR", "en-US": "EN-US" } } },
    });
    const report = reportOf(config);

    expect(entryOf(report, "chr")).toMatchObject({
      providerCode: "CHR",
      mapped: true,
      support: "unverified",
    });
    expect(warningCodes(entryOf(report, "chr"))).toEqual(["LOCALE_UNVERIFIED_BY_PROVIDER"]);
    expect(entryOf(report, "chr").warnings[0]?.message).toContain("provider.options.localeMap");
    expect(report.source).toMatchObject({ providerCode: "EN-US", support: "unverified" });
    expect(warningCodes(report.source)).toEqual(["LOCALE_UNVERIFIED_BY_PROVIDER"]);
    expect(unsupportedLocales(report)).toEqual([]);
  });

  it("warns when a configured tone cannot be applied in a target language", () => {
    const report = reportOf(deeplConfig({ targetLocales: ["de", "ja", "sv"], tone: "formal" }));

    expect(warningCodes(entryOf(report, "de"))).toEqual([]);
    expect(warningCodes(entryOf(report, "ja"))).toEqual([]);
    expect(warningCodes(entryOf(report, "sv"))).toEqual(["FORMALITY_UNSUPPORTED_BY_PROVIDER"]);
  });

  it("warns about a native glossary for a pair DeepL has no glossaries for", () => {
    const config = deeplConfig({
      targetLocales: ["de", "th"],
      provider: { id: "deepl", options: { glossaryId: "gl-1" } },
    });
    const report = reportOf(config);

    expect(warningCodes(entryOf(report, "de"))).toEqual([]);
    expect(warningCodes(entryOf(report, "th"))).toEqual(["GLOSSARY_UNSUPPORTED_BY_PROVIDER"]);
  });

  it("raises no feature warnings for a locale it already refuses", () => {
    const report = reportOf(deeplConfig({ targetLocales: ["chr"], tone: "informal" }));

    expect(entryOf(report, "chr").warnings).toEqual([]);
  });
});

describe("assessLocaleCapabilities: Google Cloud Translation", () => {
  it("marks a regional code whose base language is listed as unverified", () => {
    const report = reportOf(
      baseConfig({ provider: GOOGLE, targetLocales: ["de", "de-AT", "zh-Hant", "nb"] }),
    );

    expect(entryOf(report, "de").support).toBe("supported");
    expect(entryOf(report, "de-AT")).toMatchObject({
      providerCode: "de-AT",
      support: "unverified",
    });
    expect(entryOf(report, "de-AT").warnings[0]?.message).toContain("only its base language");
    expect(entryOf(report, "zh-Hant")).toMatchObject({
      providerCode: "zh-TW",
      support: "supported",
    });
    expect(entryOf(report, "nb")).toMatchObject({ providerCode: "no", support: "supported" });
  });

  it("warns that it applies no glossary and no tone", () => {
    const report = reportOf(
      baseConfig({
        provider: GOOGLE,
        targetLocales: ["de"],
        tone: "informal",
        glossary: { Account: "Konto" },
      }),
    );

    expect(warningCodes(entryOf(report, "de"))).toEqual([
      "GLOSSARY_UNSUPPORTED_BY_PROVIDER",
      "FORMALITY_UNSUPPORTED_BY_PROVIDER",
    ]);
  });

  it("does not warn about a glossary that applies no term to the locale", () => {
    const report = reportOf(
      baseConfig({
        provider: GOOGLE,
        targetLocales: ["de"],
        glossary: { version: 2, terms: [{ source: "Account", targets: { fr: "Compte" } }] },
      }),
    );

    expect(entryOf(report, "de").warnings).toEqual([]);
  });
});

describe("assessLocaleCapabilities: LLM providers", () => {
  it("supports every locale and warns about one outside the well-tested list", () => {
    const report = reportOf(baseConfig({ targetLocales: ["de-AT", "sw"], tone: "formal" }));

    expect(report).toMatchObject({
      provider: "anthropic",
      coverage: "open",
      tableOrigin: "static",
    });
    expect(report.source).toEqual({
      locale: "en",
      providerCode: "en",
      mapped: false,
      support: "supported",
      warnings: [],
    });
    expect(entryOf(report, "de-AT")).toEqual({
      locale: "de-AT",
      providerCode: "de-AT",
      mapped: false,
      support: "supported",
      glossary: true,
      formality: true,
      warnings: [],
    });
    expect(entryOf(report, "sw").support).toBe("supported");
    expect(warningCodes(entryOf(report, "sw"))).toEqual(["LOCALE_NOT_WELL_TESTED"]);
  });

  it("judges an LLM locale by the code it is mapped to", () => {
    const report = reportOf(
      baseConfig({
        targetLocales: ["x-klingon"],
        provider: {
          id: "openai",
          options: { model: "m", maxOutputTokens: 64, localeMap: { "x-klingon": "de" } },
        },
      }),
    );

    expect(entryOf(report, "x-klingon")).toMatchObject({ providerCode: "de", mapped: true });
    expect(entryOf(report, "x-klingon").warnings).toEqual([]);
  });
});

describe("assessLocaleCapabilities: provider none", () => {
  it("returns no report, since no provider is called", () => {
    expect(
      assessLocaleCapabilities(baseConfig({ provider: { id: "none", options: {} } }), ["de"]),
    ).toBeUndefined();
    expect(
      assertConfiguredLocalesSupported(baseConfig({ provider: { id: "none", options: {} } }), [
        "chr",
      ]),
    ).toBeUndefined();
  });
});

describe("assertConfiguredLocalesSupported", () => {
  it("names every unsupported locale with the code it would be sent as", async () => {
    const error = await refusalOf(() =>
      assertConfiguredLocalesSupported(deeplConfig({ sourceLocale: "chr" }), ["de", "en-AU"]),
    );

    expect(error.code).toBe("LOCALE_UNSUPPORTED_BY_PROVIDER");
    expect(error.message).toContain(
      'Provider "deepl" does not support the source locale "chr" (sent as "CHR"), the target locale "en-AU" (sent as "EN")',
    );
    expect(error.message).toContain("language table of 2026-09-28");
    expect(error.message).toContain("No locale was started and nothing was spent.");
    expect(error.message).toContain("provider.options.localeMap");
  });

  it("names a locale sent unchanged only once", async () => {
    const error = await refusalOf(() =>
      assertConfiguredLocalesSupported(baseConfig({ provider: GOOGLE }), ["chr-x"]),
    );

    expect(error.message).toContain('the target locale "chr-x",');
  });

  it("returns the report when every locale is supported", () => {
    expect(assertConfiguredLocalesSupported(deeplConfig(), ["de"])?.provider).toBe("deepl");
  });
});

describe("withCapabilityNotices", () => {
  it("puts the source and target warnings of each locale first among its notices", () => {
    const config = deeplConfig({
      sourceLocale: "en-US",
      targetLocales: ["de", "sv"],
      tone: "formal",
      provider: { id: "deepl", options: { localeMap: { "en-US": "EN-US" } } },
    });
    const report = reportOf(config);
    const existing = {
      ...failureSummary("sv", new Error("boom")),
      notices: [{ code: "SUB_BATCH_FAILED" as const, message: "later" }],
    };

    const [de, sv] = withCapabilityNotices(
      [failureSummary("de", new Error("x")), existing],
      report,
    );

    expect(de?.notices.map((notice) => notice.code)).toEqual(["LOCALE_UNVERIFIED_BY_PROVIDER"]);
    expect(sv?.notices.map((notice) => notice.code)).toEqual([
      "LOCALE_UNVERIFIED_BY_PROVIDER",
      "FORMALITY_UNSUPPORTED_BY_PROVIDER",
      "SUB_BATCH_FAILED",
    ]);
  });

  it("leaves a summary without warnings, or a run without a report, untouched", () => {
    const summary = failureSummary("de", new Error("x"));

    expect(withCapabilityNotices([summary], reportOf(deeplConfig()))[0]).toBe(summary);
    expect(withCapabilityNotices([summary], undefined)).toEqual([summary]);
  });

  it("adds nothing for a locale the report does not assess", () => {
    const summary = failureSummary("fr", new Error("x"));

    expect(withCapabilityNotices([summary], reportOf(deeplConfig()))[0]).toBe(summary);
  });
});

describe("assessLocaleCapabilities: LibreTranslate", () => {
  const LIBRETRANSLATE: ProviderConfig = {
    id: "libretranslate",
    options: { baseUrl: "http://localhost:5000" },
  };

  it("judges every locale unverified without a live list, and never refuses one", () => {
    const config = baseConfig({ provider: LIBRETRANSLATE, targetLocales: ["de-AT", "haw"] });
    const report = reportOf(config);

    expect(report).toMatchObject({ provider: "libretranslate", coverage: "listed" });
    expect(report.tableOrigin).toBe("static");
    expect(report.source).toMatchObject({ providerCode: "en", support: "unverified" });
    expect(entryOf(report, "de-AT")).toMatchObject({
      providerCode: "de",
      support: "unverified",
      glossary: false,
      formality: false,
    });
    expect(entryOf(report, "haw").warnings[0]?.message).toContain(
      "was not checked against the libretranslate server: a self-hosted server translates only",
    );
    expect(unsupportedLocales(report)).toEqual([]);
    expect(() => assertConfiguredLocalesSupported(config, config.targetLocales)).not.toThrow();
  });

  it("keeps the localeMap wording for a mapped locale", () => {
    const config = baseConfig({
      provider: {
        id: "libretranslate",
        options: { baseUrl: "http://localhost:5000", localeMap: { "de-CH": "de" } },
      },
      targetLocales: ["de-CH"],
    });

    expect(entryOf(reportOf(config), "de-CH").warnings[0]?.message).toContain(
      "provider.options.localeMap",
    );
  });
});

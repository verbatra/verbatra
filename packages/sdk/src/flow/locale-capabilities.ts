import {
  appliesTerms,
  isWellTestedLanguage,
  type ListedLanguageSupport,
  type LocaleMap,
  matchLanguage,
  type OpenLanguageSupport,
  type ProviderCode,
  type ProviderLanguageTable,
  providerCodeFor,
  supportsFormality,
  supportsGlossaryPair,
} from "@verbatra/ai-providers";
import { glossaryForLocale } from "../config/glossary.js";
import {
  isMachineProvider,
  type MachineProviderConfig,
  type MachineProviderId,
} from "../config/provider-config.js";
import { languageSupportOf } from "../config/provider-languages.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import type { LocaleSummary, SdkNotice, SdkNoticeCode } from "./summary.js";

/**
 * Whether the configured provider can translate from or into a locale, judged before anything is
 * spent.
 *
 * - `supported`: the code verbatra sends for the locale is on the provider's language list, or the
 *   provider is an LLM, which accepts any locale.
 * - `unverified`: the code is not on the list itself but may still work: only its base language is
 *   listed (`de-AT` sent as `de-AT` where the list has `de`), or it comes from an explicit
 *   `provider.options.localeMap` entry, which is trusted so a language the provider added after the
 *   list was dated can still be used, or the provider is a self-hosted `libretranslate` server,
 *   whose languages are the models installed on it and are only known from its live list. It is
 *   translated, with a warning.
 * - `unsupported`: neither the code nor its base language is on the list. {@link translate},
 *   {@link watch}, and {@link retranslateEntry} refuse it with `LOCALE_UNSUPPORTED_BY_PROVIDER`
 *   before anything is spent.
 */
export type LocaleSupport = "supported" | "unverified" | "unsupported";

/**
 * The warning codes a locale capability check raises. Each is also a {@link SdkNoticeCode}, so
 * {@link translate} reports the same code on the affected {@link LocaleSummary}.
 */
export type LocaleCapabilityWarningCode = Extract<
  SdkNoticeCode,
  | "LOCALE_UNVERIFIED_BY_PROVIDER"
  | "LOCALE_NOT_WELL_TESTED"
  | "GLOSSARY_UNSUPPORTED_BY_PROVIDER"
  | "FORMALITY_UNSUPPORTED_BY_PROVIDER"
>;

/** One warning of a locale capability check: advisory, it never refuses the locale. */
export interface LocaleCapabilityWarning {
  /** The stable warning code. Branch on this, not on the message. */
  readonly code: LocaleCapabilityWarningCode;
  /** A human-readable description of the warning. */
  readonly message: string;
}

/** What the configured provider supports for the source locale. */
export interface SourceLocaleCapability {
  /** The configured source locale. */
  readonly locale: string;
  /** The code verbatra sends the provider for it. */
  readonly providerCode: string;
  /**
   * True when {@link SourceLocaleCapability.providerCode} comes from `provider.options.localeMap`
   * rather than the provider's own normalization.
   */
  readonly mapped: boolean;
  /** Whether the provider can translate from it. */
  readonly support: LocaleSupport;
  /** Advisory warnings about the source locale. */
  readonly warnings: readonly LocaleCapabilityWarning[];
}

/** What the configured provider supports for one target locale. */
export interface LocaleCapability {
  /** The configured target locale. */
  readonly locale: string;
  /** The code verbatra sends the provider for it. */
  readonly providerCode: string;
  /**
   * True when {@link LocaleCapability.providerCode} comes from `provider.options.localeMap` rather
   * than the provider's own normalization.
   */
  readonly mapped: boolean;
  /** Whether the provider can translate into it. */
  readonly support: LocaleSupport;
  /**
   * Whether the provider can apply a glossary for the pair of the source language and this
   * language. Always true for an LLM provider, which receives the glossary as data, and always
   * false for Google Cloud Translation Basic and LibreTranslate, which have no glossaries. For DeepL it is true when
   * both languages are on its glossary list, which is what a native `glossaryId` needs.
   */
  readonly glossary: boolean;
  /** Whether the provider can apply a `formal` or `informal` tone in this language. */
  readonly formality: boolean;
  /** Advisory warnings about this locale; they never refuse it. */
  readonly warnings: readonly LocaleCapabilityWarning[];
}

/**
 * How a requested live refresh of a provider's language list went.
 *
 * - `refreshed`: the list was fetched and the report is judged against it.
 * - `skipped`: no request was sent, because the provider has no language list endpoint, its API key
 *   variable is not set, or the network policy refuses its host. The static table was used.
 * - `failed`: the request was sent and failed. The static table was used.
 */
export type LanguageTableRefreshStatus = "refreshed" | "skipped" | "failed";

/** The outcome of a live refresh of a provider's language list. */
export interface LanguageTableRefresh {
  /** How the refresh went. */
  readonly status: LanguageTableRefreshStatus;
  /** Why, in words. It names environment variables and hosts, never an API key value. */
  readonly detail: string;
}

/**
 * What the configured provider supports for the configured locales, judged before anything is
 * spent. A machine-translation provider (`deepl`, `google-translate`) is judged against a language
 * table verbatra ships, transcribed from the provider's documentation and dated; an LLM provider
 * accepts any locale and is judged against a list of languages it is known to handle well. A
 * self-hosted `libretranslate` server offers only the language models installed on it, so its
 * shipped table lists no language and every locale is `unverified` until a live list fetched from
 * the server (`doctor --locales --live`) is judged instead.
 */
export interface LocaleCapabilityReport {
  /** The configured provider. */
  readonly provider: MachineProviderId;
  /**
   * `listed` for a provider judged against a language table, `open` for an LLM provider, which
   * accepts any locale.
   */
  readonly coverage: "listed" | "open";
  /**
   * The date (`YYYY-MM-DD`) of the language table the report was judged against, or of the
   * well-tested list for an LLM provider. For a live table, the day it was fetched.
   */
  readonly tableVersion: string;
  /** `static` for the table verbatra ships, `live` for one fetched from the provider on request. */
  readonly tableOrigin: "static" | "live";
  /** The outcome of the live refresh. Present only when one was requested. */
  readonly live?: LanguageTableRefresh;
  /** The source locale. */
  readonly source: SourceLocaleCapability;
  /** One entry per assessed target locale, in configured order. */
  readonly locales: readonly LocaleCapability[];
}

interface Assessment {
  readonly config: VerbatraConfig;
  readonly provider: MachineProviderConfig;
  readonly localeMap: LocaleMap | undefined;
  readonly source: ProviderCode;
}

function warning(code: LocaleCapabilityWarningCode, message: string): LocaleCapabilityWarning {
  return { code, message };
}

function sentAs(locale: string, code: ProviderCode): string {
  return code.code === locale ? `"${locale}"` : `"${locale}" (sent as "${code.code}")`;
}

function listedSupport(
  table: ProviderLanguageTable,
  code: ProviderCode,
  role: "source" | "target",
): LocaleSupport {
  const match = matchLanguage(table, code.code, role);
  if (match === "exact") {
    return "supported";
  }
  return match === "base" || code.mapped || table.partial === true ? "unverified" : "unsupported";
}

function unverifiedReason(code: ProviderCode): string {
  return code.mapped
    ? "it comes from provider.options.localeMap, so it is sent as configured"
    : "only its base language is listed, so the provider may reject or generalize it";
}

function isUnknownServerLanguage(table: ProviderLanguageTable, code: ProviderCode): boolean {
  return table.partial === true && !code.mapped;
}

function unverifiedWarning(
  provider: MachineProviderId,
  locale: string,
  code: ProviderCode,
  table: ProviderLanguageTable,
): LocaleCapabilityWarning {
  if (isUnknownServerLanguage(table, code)) {
    return warning(
      "LOCALE_UNVERIFIED_BY_PROVIDER",
      `The locale ${sentAs(locale, code)} cannot be verified before a run: a self-hosted ${provider} server translates only the language models installed on it. verbatra doctor --locales --live checks them against the server; its result is not kept, so this notice appears on every run.`,
    );
  }
  return warning(
    "LOCALE_UNVERIFIED_BY_PROVIDER",
    `The locale ${sentAs(locale, code)} is not on the ${provider} language table of ${table.version}: ${unverifiedReason(code)}.`,
  );
}

function hasGlossaryFor(assessment: Assessment, locale: string): boolean {
  const { provider, config } = assessment;
  if (provider.id === "deepl" && provider.options.glossaryId !== undefined) {
    return true;
  }
  return appliesTerms(glossaryForLocale(config.glossary, locale));
}

function wantsFormality(config: VerbatraConfig): boolean {
  return config.tone === "formal" || config.tone === "informal";
}

function featureWarnings(
  assessment: Assessment,
  locale: string,
  features: { readonly glossary: boolean; readonly formality: boolean },
): readonly LocaleCapabilityWarning[] {
  const { provider, config } = assessment;
  return [
    ...(!features.glossary && hasGlossaryFor(assessment, locale)
      ? [
          warning(
            "GLOSSARY_UNSUPPORTED_BY_PROVIDER",
            `Provider "${provider.id}" cannot apply a glossary from "${config.sourceLocale}" to "${locale}", so the configured glossary is only checked after translation, not applied.`,
          ),
        ]
      : []),
    ...(!features.formality && wantsFormality(config)
      ? [
          warning(
            "FORMALITY_UNSUPPORTED_BY_PROVIDER",
            `Provider "${provider.id}" has no formality control for "${locale}", so the configured ${config.tone} tone is not applied and the provider's default register is used.`,
          ),
        ]
      : []),
  ];
}

function listedTarget(
  assessment: Assessment,
  support: ListedLanguageSupport,
  table: ProviderLanguageTable,
  locale: string,
): LocaleCapability {
  const code = providerCodeFor(support, locale, "target", assessment.localeMap);
  const verdict = listedSupport(table, code, "target");
  const usable = verdict !== "unsupported";
  const features = {
    glossary: usable && supportsGlossaryPair(table, assessment.source.code, code.code),
    formality: usable && supportsFormality(table, code.code),
  };
  return {
    locale,
    providerCode: code.code,
    mapped: code.mapped,
    support: verdict,
    ...features,
    warnings: [
      ...(verdict === "unverified"
        ? [unverifiedWarning(assessment.provider.id, locale, code, table)]
        : []),
      ...(usable ? featureWarnings(assessment, locale, features) : []),
    ],
  };
}

function openTarget(
  assessment: Assessment,
  support: OpenLanguageSupport,
  locale: string,
): LocaleCapability {
  const code = providerCodeFor(support, locale, "target", assessment.localeMap);
  const wellTested = isWellTestedLanguage(support.wellTestedLanguages, code.code);
  return {
    locale,
    providerCode: code.code,
    mapped: code.mapped,
    support: "supported",
    glossary: true,
    formality: true,
    warnings: wellTested
      ? []
      : [
          warning(
            "LOCALE_NOT_WELL_TESTED",
            `The locale ${sentAs(locale, code)} is outside the languages LLM providers are known to translate well (list of ${support.version}), so review its output with care.`,
          ),
        ],
  };
}

function listedSource(
  assessment: Assessment,
  table: ProviderLanguageTable,
): SourceLocaleCapability {
  const locale = assessment.config.sourceLocale;
  const verdict = listedSupport(table, assessment.source, "source");
  const warned = verdict === "unverified" && !isUnknownServerLanguage(table, assessment.source);
  return {
    locale,
    providerCode: assessment.source.code,
    mapped: assessment.source.mapped,
    support: verdict,
    warnings: warned
      ? [unverifiedWarning(assessment.provider.id, locale, assessment.source, table)]
      : [],
  };
}

function openSource(assessment: Assessment): SourceLocaleCapability {
  return {
    locale: assessment.config.sourceLocale,
    providerCode: assessment.source.code,
    mapped: assessment.source.mapped,
    support: "supported",
    warnings: [],
  };
}

export function assessProviderLocales(
  config: VerbatraConfig,
  provider: MachineProviderConfig,
  locales: readonly string[],
  liveTable?: ProviderLanguageTable,
): LocaleCapabilityReport {
  const support = languageSupportOf(provider);
  const localeMap = provider.options.localeMap;
  const assessment: Assessment = {
    config,
    provider,
    localeMap,
    source: providerCodeFor(support, config.sourceLocale, "source", localeMap),
  };
  if (support.coverage === "open") {
    return {
      provider: provider.id,
      coverage: "open",
      tableVersion: support.version,
      tableOrigin: "static",
      source: openSource(assessment),
      locales: locales.map((locale) => openTarget(assessment, support, locale)),
    };
  }
  const table = liveTable ?? support.table;
  return {
    provider: provider.id,
    coverage: "listed",
    tableVersion: table.version,
    tableOrigin: table.origin,
    source: listedSource(assessment, table),
    locales: locales.map((locale) => listedTarget(assessment, support, table, locale)),
  };
}

export function assessLocaleCapabilities(
  config: VerbatraConfig,
  locales: readonly string[],
): LocaleCapabilityReport | undefined {
  return isMachineProvider(config.provider)
    ? assessProviderLocales(config, config.provider, locales)
    : undefined;
}

function unsupportedParts(report: LocaleCapabilityReport): readonly string[] {
  const source =
    report.source.support === "unsupported"
      ? [`the source locale ${sentAs(report.source.locale, codeOf(report.source))}`]
      : [];
  const targets = report.locales
    .filter((entry) => entry.support === "unsupported")
    .map((entry) => `the target locale ${sentAs(entry.locale, codeOf(entry))}`);
  return [...source, ...targets];
}

function codeOf(entry: { readonly providerCode: string; readonly mapped: boolean }): ProviderCode {
  return { code: entry.providerCode, mapped: entry.mapped };
}

export function unsupportedLocales(report: LocaleCapabilityReport): readonly string[] {
  return [
    ...(report.source.support === "unsupported" ? [report.source.locale] : []),
    ...report.locales
      .filter((entry) => entry.support === "unsupported")
      .map((entry) => entry.locale),
  ];
}

export function assertLocalesSupported(report: LocaleCapabilityReport | undefined): void {
  if (report === undefined) {
    return;
  }
  const parts = unsupportedParts(report);
  if (parts.length === 0) {
    return;
  }
  throw new SdkError(
    "LOCALE_UNSUPPORTED_BY_PROVIDER",
    `Provider "${report.provider}" does not support ${parts.join(", ")}, according to its ` +
      `language table of ${report.tableVersion}. No locale was started and nothing was spent. ` +
      "Remove the locale from the config or leave it out of this run, or map it to a code the " +
      "provider lists in provider.options.localeMap; an explicit mapping is trusted, so a " +
      "language the provider added since that date can be used that way.",
  );
}

export function assertConfiguredLocalesSupported(
  config: VerbatraConfig,
  locales: readonly string[],
): LocaleCapabilityReport | undefined {
  const report = assessLocaleCapabilities(config, locales);
  assertLocalesSupported(report);
  return report;
}

function noticesFor(report: LocaleCapabilityReport, locale: string): readonly SdkNotice[] {
  const entry = report.locales.find((candidate) => candidate.locale === locale);
  return [...report.source.warnings, ...(entry?.warnings ?? [])];
}

export function withCapabilityNotices(
  summaries: readonly LocaleSummary[],
  report: LocaleCapabilityReport | undefined,
): LocaleSummary[] {
  if (report === undefined) {
    return [...summaries];
  }
  return summaries.map((summary) => {
    const notices = noticesFor(report, summary.locale);
    return notices.length === 0
      ? summary
      : { ...summary, notices: [...notices, ...summary.notices] };
  });
}

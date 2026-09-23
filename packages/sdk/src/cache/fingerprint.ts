import type { LocaleGlossary } from "@verbatra/ai-providers";
import { stableStringHash } from "@verbatra/core";
import { glossaryForLocale } from "../config/glossary.js";
import type { MachineProviderConfig, ProviderConfig } from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { sortRecordKeys } from "../record-utils.js";

function fingerprintModel(provider: ProviderConfig): string | null {
  const options: Record<string, unknown> = provider.options;
  const model = options.model;
  return typeof model === "string" ? model : null;
}

function fingerprintLocaleMap(provider: MachineProviderConfig): Record<string, string> | undefined {
  const localeMap = provider.options.localeMap;
  if (localeMap === undefined || Object.keys(localeMap).length === 0) {
    return undefined;
  }
  return sortRecordKeys(localeMap);
}

function isTermMapOnly(glossary: LocaleGlossary): boolean {
  return (
    glossary.doNotTranslate.length === 0 &&
    glossary.terms.every(
      (term) =>
        term.target !== undefined &&
        term.forbidden.length === 0 &&
        term.note === undefined &&
        term.partOfSpeech === undefined,
    )
  );
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalGlossary(glossary: LocaleGlossary | undefined): unknown {
  if (glossary === undefined) {
    return {};
  }
  if (isTermMapOnly(glossary)) {
    return sortRecordKeys(
      Object.fromEntries(glossary.terms.map(({ source, target }) => [source, target])),
    );
  }
  return {
    terms: [...glossary.terms]
      .sort((a, b) => byCodeUnit(a.source, b.source))
      .map(({ source, target, forbidden, note, partOfSpeech }) => ({
        source,
        target: target ?? null,
        forbidden: [...forbidden].sort(byCodeUnit),
        note: note ?? null,
        partOfSpeech: partOfSpeech ?? null,
      })),
    doNotTranslate: glossary.doNotTranslate.map(({ term }) => term).sort(byCodeUnit),
  };
}

const HUMAN_ONLY_CANONICAL = JSON.stringify({ provider: "none" });

export type FingerprintFor = (locale: string) => string;

export function computeFingerprint(config: VerbatraConfig, locale: string): string {
  if (config.provider.id === "none") {
    return stableStringHash(HUMAN_ONLY_CANONICAL);
  }
  const localeMap = fingerprintLocaleMap(config.provider);
  const canonical = JSON.stringify({
    provider: config.provider.id,
    model: fingerprintModel(config.provider),
    tone: config.tone ?? null,
    glossary: canonicalGlossary(glossaryForLocale(config.glossary, locale)),
    ...(localeMap !== undefined ? { localeMap } : {}),
  });
  return stableStringHash(canonical);
}

export function fingerprintsFor(config: VerbatraConfig): FingerprintFor {
  const cache = new Map<string, string>();
  return (locale) => {
    const known = cache.get(locale);
    if (known !== undefined) {
      return known;
    }
    const fingerprint = computeFingerprint(config, locale);
    cache.set(locale, fingerprint);
    return fingerprint;
  };
}

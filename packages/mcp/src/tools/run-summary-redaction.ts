import type { FuzzyCacheHit, LocaleSummary, RunSummary, ValueMarker } from "@verbatra/sdk";
import { markFields } from "./value-redaction.js";

export function redactFuzzyHit(hit: FuzzyCacheHit, marker: ValueMarker): FuzzyCacheHit {
  return markFields(hit, ["previousSource"], marker);
}

function redactLocaleSummary(locale: LocaleSummary, marker: ValueMarker): LocaleSummary {
  return {
    ...locale,
    fuzzyHits: locale.fuzzyHits.map((hit) => redactFuzzyHit(hit, marker)),
    protected: locale.protected.map((entry) => markFields(entry, ["suggestion"], marker)),
    notices: locale.notices.map((notice) => markFields(notice, ["message"], marker)),
    ...(locale.error !== undefined ? { error: markFields(locale.error, ["message"], marker) } : {}),
    ...(locale.integrityRefusals !== undefined
      ? {
          integrityRefusals: locale.integrityRefusals.map(
            ({ details: _details, ...refusal }) => refusal,
          ),
        }
      : {}),
  };
}

export function redactRunSummary<T extends RunSummary>(summary: T, marker: ValueMarker): T {
  return {
    ...summary,
    locales: summary.locales.map((locale) => redactLocaleSummary(locale, marker)),
  };
}

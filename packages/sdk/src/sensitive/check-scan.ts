import type { LocaleGlossary } from "@verbatra/ai-providers";
import type { LocaleResource } from "@verbatra/core";
import { glossaryForLocale } from "../config/glossary.js";
import type { VerbatraConfig } from "../config/schema.js";
import {
  findingOf,
  type SensitiveField,
  scanEntryFields,
  sensitiveRules,
  termTexts,
  textsHit,
} from "./guard.js";
import type { SensitiveFindingSource, SensitiveRules } from "./scan-text.js";

/** One source key whose content a `sensitiveData` detector or pattern matched. */
export interface SensitiveKeyFinding {
  /** The source key. The matched text itself is never reported. */
  readonly key: string;
  /** Where in the key the match was found. */
  readonly fields: readonly SensitiveField[];
  /** The detectors that matched, and `pattern` for a configured pattern. */
  readonly detectors: readonly SensitiveFindingSource[];
}

/** The keyless sensitive-content scan of {@link check}, see {@link CheckInput.sensitive}. */
export interface CheckSensitiveSummary {
  /** Every source key with a match, in source order. */
  readonly findings: readonly SensitiveKeyFinding[];
  /**
   * How many glossary terms, across every reported target locale, hold a match in their source,
   * translation, forbidden renderings or notes, or as a do-not-translate term.
   */
  readonly glossaryTerms: number;
}

function flaggedTerms(rules: SensitiveRules, glossary: LocaleGlossary): string[] {
  const hits = (texts: readonly (string | undefined)[]): boolean =>
    textsHit(rules, texts).length > 0;
  return [
    ...glossary.terms.filter((term) => hits(termTexts(term))).map((term) => JSON.stringify(term)),
    ...glossary.doNotTranslate
      .filter((term) => hits([term.term]))
      .map((term) => JSON.stringify(term)),
  ];
}

export function scanProjectForSensitiveContent(
  config: VerbatraConfig,
  source: LocaleResource,
  locales: readonly string[],
): CheckSensitiveSummary {
  const rules = sensitiveRules(config.sensitiveData);
  const findings: SensitiveKeyFinding[] = [];
  for (const entry of source.entries.values()) {
    const finding = findingOf(scanEntryFields(rules, entry, true));
    if (finding !== undefined) {
      findings.push({ key: entry.key, fields: finding.fields, detectors: finding.sources });
    }
  }
  const terms = new Set<string>();
  for (const locale of locales) {
    const glossary = glossaryForLocale(config.glossary, locale);
    for (const term of glossary === undefined ? [] : flaggedTerms(rules, glossary)) {
      terms.add(term);
    }
  }
  return { findings, glossaryTerms: terms.size };
}

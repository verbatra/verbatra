import type { LocaleGlossary } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import type { SdkNotice } from "../flow/summary.js";
import type { GlossaryVerdict, SensitiveGuard } from "./guard.js";
import type { SensitiveFindingSource } from "./scan-text.js";

export interface SensitivePlan {
  readonly withheld: ReadonlySet<string>;
  readonly redacted: ReadonlySet<string>;
  readonly flagged: readonly string[];
  readonly sources: readonly SensitiveFindingSource[];
  readonly glossary: GlossaryVerdict;
}

const NO_GLOSSARY: GlossaryVerdict = { flagged: 0, sources: [], send: undefined };

export const NO_SENSITIVE_PLAN: SensitivePlan = {
  withheld: new Set(),
  redacted: new Set(),
  flagged: [],
  sources: [],
  glossary: NO_GLOSSARY,
};

const NOTICE_KEY_LIMIT = 5;

export function planSensitive(
  guard: SensitiveGuard | undefined,
  entries: readonly TranslationEntry[],
  glossary: LocaleGlossary | undefined,
): SensitivePlan {
  if (guard === undefined) {
    return NO_SENSITIVE_PLAN;
  }
  const withheld = new Set<string>();
  const redacted = new Set<string>();
  const flagged: string[] = [];
  const sources = new Set<SensitiveFindingSource>();
  for (const entry of entries) {
    const verdict = guard.entry(entry);
    if (verdict.finding === undefined) {
      continue;
    }
    flagged.push(entry.key);
    for (const source of verdict.finding.sources) {
      sources.add(source);
    }
    if (verdict.action === "withhold") {
      withheld.add(entry.key);
    } else if (verdict.action === "redact") {
      redacted.add(entry.key);
    }
  }
  const glossaryVerdict = guard.glossary(glossary);
  for (const source of glossaryVerdict.sources) {
    sources.add(source);
  }
  return { withheld, redacted, flagged, sources: [...sources].sort(), glossary: glossaryVerdict };
}

function keyList(keys: readonly string[]): string {
  const shown = keys.slice(0, NOTICE_KEY_LIMIT).map((key) => JSON.stringify(key));
  const more = keys.length > shown.length ? `, and ${keys.length - shown.length} more` : "";
  return `${shown.join(", ")}${more}`;
}

function counted(keys: readonly string[], glossaryTerms: number): string {
  const values = keys.length === 1 ? "1 key" : `${keys.length} keys`;
  if (glossaryTerms === 0) {
    return values;
  }
  const terms = glossaryTerms === 1 ? "1 glossary term" : `${glossaryTerms} glossary terms`;
  return keys.length === 0 ? terms : `${values} and ${terms}`;
}

function isOne(keys: readonly string[], glossaryTerms: number): boolean {
  return keys.length + glossaryTerms === 1;
}

function named(keys: readonly string[]): string {
  return keys.length === 0 ? "" : `: ${keyList(keys)}`;
}

function sentNotice(plan: SensitivePlan): SdkNotice | undefined {
  const terms = plan.glossary.flagged;
  if (plan.flagged.length === 0 && terms === 0) {
    return undefined;
  }
  const verb = isOne(plan.flagged, terms) ? "holds" : "hold";
  return {
    code: "SENSITIVE_CONTENT_SENT",
    message:
      `${counted(plan.flagged, terms)} sent to the provider ${verb} content that looks ` +
      `sensitive (${plan.sources.join(", ")})${named(plan.flagged)}. Allow it in ` +
      "sensitiveData.allow, or set sensitiveData.mode to redact or block to keep it in-house.",
  };
}

function redactedNotice(redacted: readonly string[]): SdkNotice | undefined {
  if (redacted.length === 0) {
    return undefined;
  }
  return {
    code: "SENSITIVE_CONTENT_REDACTED",
    message:
      `${counted(redacted, 0)} had content that looks sensitive replaced before sending and ` +
      `restored in the translation${named(redacted)}.`,
  };
}

function withheldNotice(withheld: readonly string[], plan: SensitivePlan): SdkNotice | undefined {
  const terms = plan.glossary.flagged;
  if (withheld.length === 0 && terms === 0) {
    return undefined;
  }
  const reason = isOne(withheld, terms)
    ? "was not sent because it holds"
    : "were not sent because they hold";
  return {
    code: "SENSITIVE_CONTENT_WITHHELD",
    message:
      `${counted(withheld, terms)} ${reason} content that looks sensitive ` +
      `(${plan.sources.join(", ")})${named(withheld)}. Remove it, or allow it in ` +
      "sensitiveData.allow.",
  };
}

export function sensitiveNotices(
  guard: SensitiveGuard | undefined,
  plan: SensitivePlan,
  withheld: readonly string[],
): readonly SdkNotice[] {
  if (guard === undefined) {
    return [];
  }
  if (guard.mode === "warn") {
    return [sentNotice(plan)].filter((notice) => notice !== undefined);
  }
  const withheldSet = new Set(withheld);
  const redacted = [...plan.redacted].filter((key) => !withheldSet.has(key)).sort();
  return [redactedNotice(redacted), withheldNotice(withheld, plan)].filter(
    (notice) => notice !== undefined,
  );
}

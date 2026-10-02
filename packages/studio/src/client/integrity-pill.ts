import type { RpcResultFor } from "../shared/rpc/contract.js";

export type KeyIntegrityLocaleEntry = RpcResultFor<"key.integrity">["locales"][number];

type LocaleIntegrityReport = RpcResultFor<"locale.integrity">["locales"];

export function withFullIntegrity(
  changed: readonly KeyIntegrityLocaleEntry[],
  full: LocaleIntegrityReport,
  key: string,
): readonly KeyIntegrityLocaleEntry[] {
  const judged = new Set(changed.map((entry) => entry.locale));
  const merged = [...changed];
  for (const report of full) {
    const failing = report.entries.find((entry) => entry.key === key);
    if (failing === undefined || judged.has(report.locale)) {
      continue;
    }
    merged.push({
      locale: report.locale,
      hasPlaceholders: failing.hasPlaceholders,
      matches: failing.matches,
      missing: failing.missing,
      extra: failing.extra,
      icuValid: failing.icuValid,
      icuArmsMatch: failing.icuArmsMatch,
      icuArmDetails: failing.icuArmDetails,
      markupMatches: failing.markupMatches,
      markupDetails: failing.markupDetails,
    });
  }
  return merged;
}

export type IntegrityPillTone = "success" | "neutral" | "danger";

export interface IntegrityPillView {
  readonly tone: IntegrityPillTone;
  readonly label: string;
  readonly detail: string | null;
}

function formatMismatchDetail(missing: readonly string[], extra: readonly string[]): string {
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    parts.push(`extra ${extra.join(", ")}`);
  }
  return parts.join("; ");
}

export type IntegrityVerdict = Omit<KeyIntegrityLocaleEntry, "locale">;

export function deriveIntegrityPillView(
  locales: readonly KeyIntegrityLocaleEntry[],
  locale: string,
): IntegrityPillView | null {
  const entry = locales.find((candidate) => candidate.locale === locale);
  return entry === undefined ? null : integrityVerdictView(entry);
}

export function hasIntegrityProblem(entry: IntegrityVerdict): boolean {
  return integrityVerdictView(entry).tone === "danger";
}

export function integrityVerdictView(entry: IntegrityVerdict): IntegrityPillView {
  if (!entry.matches) {
    return {
      tone: "danger",
      label: "Placeholder mismatch",
      detail: formatMismatchDetail(entry.missing, entry.extra),
    };
  }
  if (!entry.icuValid) {
    return { tone: "danger", label: "Invalid message syntax", detail: null };
  }
  if (!entry.icuArmsMatch) {
    return {
      tone: "danger",
      label: "ICU arms mismatch",
      detail: entry.icuArmDetails.length > 0 ? entry.icuArmDetails.join("; ") : null,
    };
  }
  if (!entry.markupMatches) {
    return {
      tone: "danger",
      label: "Inline markup mismatch",
      detail: entry.markupDetails.length > 0 ? entry.markupDetails.join(" ") : null,
    };
  }
  if (!entry.hasPlaceholders) {
    return { tone: "neutral", label: "No placeholders", detail: null };
  }
  return { tone: "success", label: "Placeholders match", detail: null };
}

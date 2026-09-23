import type { RpcResultFor } from "../shared/rpc/contract.js";

export type DiffLocale = RpcResultFor<"status.diff">["locales"][number];

export type KeyLocaleStatus = "missing" | "changed" | "orphaned" | "protected" | "in-sync";

export interface KeyLocaleStatusRow {
  readonly locale: string;
  readonly status: KeyLocaleStatus;
}

function statusForLocale(locale: DiffLocale, key: string): KeyLocaleStatus {
  if (locale.protected?.includes(key) === true) {
    return "protected";
  }
  if (locale.missing.includes(key)) {
    return "missing";
  }
  if (locale.changed.includes(key)) {
    return "changed";
  }
  if (locale.orphaned.includes(key)) {
    return "orphaned";
  }
  return "in-sync";
}

export function deriveKeyLocaleStatus(
  locales: readonly DiffLocale[],
  key: string,
): readonly KeyLocaleStatusRow[] {
  return locales.map((locale) => ({ locale: locale.locale, status: statusForLocale(locale, key) }));
}

export function isFullyInSync(locales: readonly DiffLocale[]): boolean {
  return locales.every(
    (locale) =>
      locale.missing.length === 0 && locale.changed.length === 0 && locale.orphaned.length === 0,
  );
}

export function driftKeys(locales: readonly DiffLocale[]): readonly string[] {
  const keys = new Set<string>();
  for (const locale of locales) {
    for (const key of locale.missing) {
      keys.add(key);
    }
    for (const key of locale.changed) {
      keys.add(key);
    }
    for (const key of locale.orphaned) {
      keys.add(key);
    }
  }
  return [...keys].sort();
}

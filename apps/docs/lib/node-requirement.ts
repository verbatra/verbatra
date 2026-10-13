import type { Locale } from "./i18n";

const CARET = /^\^(\d+)\.(\d+)\.(\d+)$/;
const AT_LEAST = /^>=(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

function minimumVersion(major: string, minor = "0", patch = "0"): string {
  if (patch !== "0") return `${major}.${minor}.${patch}+`;
  if (minor !== "0") return `${major}.${minor}+`;
  return `${major}+`;
}

function comparatorLabel(comparator: string): string {
  const caret = CARET.exec(comparator);
  if (caret) return minimumVersion(caret[1] ?? "", caret[2], caret[3]);
  const atLeast = AT_LEAST.exec(comparator);
  if (atLeast) return minimumVersion(atLeast[1] ?? "", atLeast[2], atLeast[3]);
  throw new Error(`Unsupported engines.node comparator: ${comparator}`);
}

export function nodeVersionsLabel(range: string, locale: Locale): string {
  const versions = range.split("||").map((part) => comparatorLabel(part.trim()));
  return new Intl.ListFormat(locale, { type: "disjunction" }).format(versions);
}

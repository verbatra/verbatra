import { chineseScriptOf, type ParsedLocale, parseLocale } from "../locale-map.js";

export const DEEPL_REGIONAL_TARGET_CODES: ReadonlySet<string> = new Set([
  "DE-CH",
  "DE-DE",
  "EN-GB",
  "EN-US",
  "ES-419",
  "FR-CA",
  "FR-FR",
  "PT-BR",
  "PT-PT",
]);

function primaryLanguage(locale: string, parsed: ParsedLocale | undefined): string {
  return (parsed?.language ?? locale.replace(/-.*$/s, "")).toUpperCase();
}

export function toDeepLSourceCode(locale: string): string {
  return primaryLanguage(locale, parseLocale(locale));
}

export function toDeepLTargetCode(locale: string): string {
  const parsed = parseLocale(locale);
  const language = primaryLanguage(locale, parsed);
  if (parsed === undefined) {
    return language;
  }
  const chineseScript = chineseScriptOf(parsed);
  if (chineseScript !== undefined) {
    return `ZH-${chineseScript.toUpperCase()}`;
  }
  const regional = `${language}-${parsed.region ?? ""}`;
  return DEEPL_REGIONAL_TARGET_CODES.has(regional) ? regional : language;
}

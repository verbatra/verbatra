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

const LATIN_AMERICAN_SPANISH_REGIONS: ReadonlySet<string> = new Set([
  "419",
  "AR",
  "BO",
  "CL",
  "CO",
  "CR",
  "CU",
  "DO",
  "EC",
  "GT",
  "HN",
  "MX",
  "NI",
  "PA",
  "PE",
  "PR",
  "PY",
  "SV",
  "US",
  "UY",
  "VE",
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
  if (parsed.region === undefined) {
    return language;
  }
  if (language === "ES" && LATIN_AMERICAN_SPANISH_REGIONS.has(parsed.region)) {
    return "ES-419";
  }
  const regional = `${language}-${parsed.region}`;
  return DEEPL_REGIONAL_TARGET_CODES.has(regional) ? regional : language;
}

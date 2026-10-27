import { chineseScriptOf, parseLocale } from "../locale-map.js";

const CHINESE_CODES = { Hans: "zh-Hans", Hant: "zh-Hant" } as const;

export function toLibreTranslateCode(locale: string): string {
  const parsed = parseLocale(locale);
  if (parsed === undefined) {
    return locale;
  }
  const chineseScript = chineseScriptOf(parsed);
  if (chineseScript !== undefined) {
    return CHINESE_CODES[chineseScript];
  }
  if (parsed.language === "pt" && parsed.region === "BR") {
    return "pt-BR";
  }
  return parsed.language;
}

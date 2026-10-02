import { chineseScriptOf, parseLocale } from "../locale-map.js";

const CHINESE_CODES = { Hans: "zh-CN", Hant: "zh-TW" } as const;

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = { nb: "no" };

export function toGoogleTranslateCode(locale: string): string {
  const parsed = parseLocale(locale);
  if (parsed === undefined) {
    return locale;
  }
  const chineseScript = chineseScriptOf(parsed);
  if (chineseScript !== undefined) {
    return CHINESE_CODES[chineseScript];
  }
  if (parsed.script === undefined && parsed.region === undefined) {
    return LANGUAGE_ALIASES[parsed.language] ?? locale;
  }
  return locale;
}

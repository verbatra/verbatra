import { z } from "zod";

export const LOCALE_MAP_VALUE_MAX_LENGTH = 64;

export type LocaleMap = Readonly<Record<string, string>>;

export const localeMapConfigSchema = z.object({
  localeMap: z
    .record(z.string().min(1), z.string().min(1).max(LOCALE_MAP_VALUE_MAX_LENGTH))
    .optional(),
});

export type LocaleNormalizer = (locale: string) => string;

const keepLocale: LocaleNormalizer = (locale) => locale;

export function resolveProviderLocale(
  locale: string,
  localeMap: LocaleMap | undefined,
  normalize: LocaleNormalizer = keepLocale,
): string {
  const mapped =
    localeMap !== undefined && Object.hasOwn(localeMap, locale) ? localeMap[locale] : undefined;
  return mapped ?? normalize(locale);
}

export interface ParsedLocale {
  readonly language: string;
  readonly script?: string;
  readonly region?: string;
}

export function parseLocale(locale: string): ParsedLocale | undefined {
  try {
    const parsed = new Intl.Locale(locale);
    return {
      language: parsed.language,
      ...(parsed.script !== undefined ? { script: parsed.script } : {}),
      ...(parsed.region !== undefined ? { region: parsed.region } : {}),
    };
  } catch {
    return undefined;
  }
}

const TRADITIONAL_CHINESE_REGIONS: ReadonlySet<string> = new Set(["TW", "HK", "MO"]);
const SIMPLIFIED_CHINESE_REGIONS: ReadonlySet<string> = new Set(["CN", "SG"]);

export type ChineseScript = "Hans" | "Hant";

export function chineseScriptOf(locale: ParsedLocale): ChineseScript | undefined {
  if (locale.language !== "zh") {
    return undefined;
  }
  if (locale.script === "Hans" || locale.script === "Hant") {
    return locale.script;
  }
  if (locale.region === undefined) {
    return undefined;
  }
  if (TRADITIONAL_CHINESE_REGIONS.has(locale.region)) {
    return "Hant";
  }
  return SIMPLIFIED_CHINESE_REGIONS.has(locale.region) ? "Hans" : undefined;
}

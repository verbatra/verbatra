import { localeCodeSchema } from "../config/locale-code.js";
import type { SdkFs } from "../fs.js";
import { MAX_SAMPLE_BYTES, readTextSafely } from "./format-evidence.js";

export interface CatalogueLocales {
  readonly sourceLocale: string | undefined;
  readonly locales: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocale(value: unknown): value is string {
  return typeof value === "string" && localeCodeSchema.safeParse(value).success;
}

function parseCatalogue(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function localizedLocales(strings: unknown): readonly string[] {
  if (!isRecord(strings)) {
    return [];
  }
  const found = new Set<string>();
  for (const entry of Object.values(strings)) {
    const localizations = isRecord(entry) ? entry.localizations : undefined;
    if (isRecord(localizations)) {
      for (const locale of Object.keys(localizations)) {
        found.add(locale);
      }
    }
  }
  return [...found].filter(isLocale);
}

export async function readCatalogueLocales(path: string, fs: SdkFs): Promise<CatalogueLocales> {
  const content = await readTextSafely(path, fs, MAX_SAMPLE_BYTES);
  const catalogue = content === undefined ? undefined : parseCatalogue(content);
  if (!isRecord(catalogue)) {
    return { sourceLocale: undefined, locales: [] };
  }
  const sourceLocale = isLocale(catalogue.sourceLanguage) ? catalogue.sourceLanguage : undefined;
  const locales = new Set(localizedLocales(catalogue.strings));
  if (sourceLocale !== undefined) {
    locales.add(sourceLocale);
  }
  return { sourceLocale, locales: [...locales].sort() };
}

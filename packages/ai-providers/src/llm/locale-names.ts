export interface LocaleNames {
  readonly name: string;
  readonly script?: string;
  readonly region?: string;
}

const DISPLAY_LOCALE = "en";
const UNKNOWN_SCRIPT = "Zzzz";
const UNKNOWN_REGION = "ZZ";

const languageNames = new Intl.DisplayNames(DISPLAY_LOCALE, {
  type: "language",
  languageDisplay: "standard",
  fallback: "none",
});
const scriptNames = new Intl.DisplayNames(DISPLAY_LOCALE, { type: "script", fallback: "none" });
const regionNames = new Intl.DisplayNames(DISPLAY_LOCALE, { type: "region", fallback: "none" });

function knownSubtag(subtag: string | undefined, unknown: string): string | undefined {
  return subtag === unknown ? undefined : subtag;
}

function displayName(names: Intl.DisplayNames, code: string | undefined): string | undefined {
  return code === undefined ? undefined : names.of(code);
}

export function localeNamesOf(locale: string): LocaleNames | undefined {
  try {
    const parsed = new Intl.Locale(locale);
    const scriptCode = knownSubtag(parsed.script, UNKNOWN_SCRIPT);
    const regionCode = knownSubtag(parsed.region, UNKNOWN_REGION);
    const namedTag = parsed.baseName
      .split("-")
      .filter((subtag) => subtag !== UNKNOWN_SCRIPT && subtag !== UNKNOWN_REGION)
      .join("-");
    const name = languageNames.of(namedTag);
    if (name === undefined) {
      return undefined;
    }
    const script = displayName(scriptNames, scriptCode);
    const region = displayName(regionNames, regionCode);
    return {
      name,
      ...(script !== undefined ? { script } : {}),
      ...(region !== undefined ? { region } : {}),
    };
  } catch {
    return undefined;
  }
}

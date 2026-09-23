export interface LocaleNames {
  readonly name: string;
  readonly script?: string;
  readonly region?: string;
}

const DISPLAY_LOCALE = "en";

const languageNames = new Intl.DisplayNames(DISPLAY_LOCALE, {
  type: "language",
  languageDisplay: "standard",
  fallback: "none",
});
const scriptNames = new Intl.DisplayNames(DISPLAY_LOCALE, { type: "script", fallback: "none" });
const regionNames = new Intl.DisplayNames(DISPLAY_LOCALE, { type: "region", fallback: "none" });

function displayName(names: Intl.DisplayNames, code: string | undefined): string | undefined {
  return code === undefined ? undefined : names.of(code);
}

export function localeNamesOf(locale: string): LocaleNames | undefined {
  try {
    const parsed = new Intl.Locale(locale);
    const name = languageNames.of(parsed.baseName);
    if (name === undefined) {
      return undefined;
    }
    const script = displayName(scriptNames, parsed.script);
    const region = displayName(regionNames, parsed.region);
    return {
      name,
      ...(script !== undefined ? { script } : {}),
      ...(region !== undefined ? { region } : {}),
    };
  } catch {
    return undefined;
  }
}

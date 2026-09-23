import { isMachineProvider, type ProviderConfig } from "./provider-config.js";

export interface LocaleMapScope {
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly provider: ProviderConfig;
}

export interface UnknownLocaleMapKey {
  readonly key: string;
  readonly message: string;
}

function configuredLocales(scope: LocaleMapScope): readonly string[] {
  return [scope.sourceLocale, ...scope.targetLocales];
}

function unknownKeyMessage(key: string, configured: readonly string[]): string {
  const lowered = key.toLowerCase();
  const sameIgnoringCase = configured.find((locale) => locale.toLowerCase() === lowered);
  const hint = sameIgnoringCase === undefined ? "" : `; did you mean "${sameIgnoringCase}"?`;
  return (
    `"${key}" is not a configured locale: a localeMap key must be sourceLocale or one of ` +
    `targetLocales, spelled as configured${hint}`
  );
}

export function findUnknownLocaleMapKeys(scope: LocaleMapScope): readonly UnknownLocaleMapKey[] {
  if (!isMachineProvider(scope.provider) || scope.provider.options.localeMap === undefined) {
    return [];
  }
  const configured = configuredLocales(scope);
  return Object.keys(scope.provider.options.localeMap)
    .filter((key) => !configured.includes(key))
    .map((key) => ({ key, message: unknownKeyMessage(key, configured) }));
}

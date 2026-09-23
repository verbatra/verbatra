import { ProviderError } from "../errors.js";

const DEPRECATED_BARE_TARGET_CODES: ReadonlySet<string> = new Set(["en", "pt"]);

function sentFor(code: string, locale: string): string {
  return code === locale ? `"${code}"` : `"${code}" (for the locale "${locale}")`;
}

export function assertValidDeepLSourceLocale(code: string, locale: string): void {
  if (code.includes("-")) {
    throw new ProviderError(
      "INVALID_REQUEST",
      `DeepL does not accept a regional or script source language code: ${sentFor(code, locale)}. ` +
        `Only the base language code is valid as a DeepL source (for example, "EN" instead of ` +
        `"EN-US"); fix provider.options.localeMap.`,
    );
  }
}

export function assertValidDeepLTargetLocale(code: string, locale: string): void {
  if (DEPRECATED_BARE_TARGET_CODES.has(code.toLowerCase())) {
    throw new ProviderError(
      "INVALID_REQUEST",
      `DeepL requires a regional target code instead of ${sentFor(code, locale)}: "EN-GB" or ` +
        `"EN-US" for English, "PT-PT" or "PT-BR" for Portuguese. Name the variant in the locale ` +
        `code or map it with provider.options.localeMap.`,
    );
  }
}

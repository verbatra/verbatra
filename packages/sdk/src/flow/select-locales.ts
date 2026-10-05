import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";

export function selectLocales(
  config: Pick<VerbatraConfig, "targetLocales">,
  requested?: readonly string[],
): readonly string[] {
  if (requested === undefined) {
    return config.targetLocales;
  }
  const configured = new Set(config.targetLocales);
  const unknown = requested.filter((locale) => !configured.has(locale));
  if (unknown.length > 0) {
    const label = unknown.length === 1 ? "locale" : "locales";
    throw new SdkError(
      "UNKNOWN_LOCALE",
      `Requested ${label} not in the configured target locales: ${unknown.join(", ")}. ` +
        `Configured targets: ${config.targetLocales.join(", ")}.`,
    );
  }
  const wanted = new Set(requested);
  return config.targetLocales.filter((locale) => wanted.has(locale));
}

/**
 * Refuses a locale that is not one of the config's target locales. It returns nothing for a
 * configured target, and throws otherwise with the same structured error, and the same message,
 * that every SDK flow taking a `locales` filter raises, so a surface that takes a single locale
 * of its own fails exactly as the SDK does.
 *
 * @param config - The resolved config, or any object carrying its `targetLocales`.
 * @param locale - The locale to check, compared exactly as configured.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the locale is not a configured target locale.
 *
 * @example
 * ```ts
 * import { assertTargetLocale, glossaryForLocale, readCurrentGlossary } from "@verbatra/sdk";
 *
 * assertTargetLocale(loaded.config, "de");
 * const glossary = await readCurrentGlossary({ loaded });
 * const forGerman = glossaryForLocale(glossary, "de");
 * ```
 */
export function assertTargetLocale(
  config: Pick<VerbatraConfig, "targetLocales">,
  locale: string,
): void {
  selectLocales(config, [locale]);
}

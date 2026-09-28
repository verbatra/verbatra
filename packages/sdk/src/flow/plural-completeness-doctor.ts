import { type FormatAdapter, tracksPluralCategories } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage } from "../errors.js";
import type { SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { readTarget } from "./diff-locales.js";
import { findIncompletePlurals, type IncompletePlural } from "./plural-completeness.js";
import { readSourceResource } from "./source.js";

const LISTED_PLURALS = 10;

interface LocalePluralGaps {
  readonly locale: string;
  readonly plurals: readonly IncompletePlural[];
}

async function incompletePluralsByLocale(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
  adapter: FormatAdapter,
): Promise<readonly LocalePluralGaps[]> {
  const resolver = createLocalePathResolver(cwd, config);
  const { resource: source } = await readSourceResource(config, resolver, fs, adapter);
  return Promise.all(
    config.targetLocales.map(async (locale) => {
      const target = await readTarget(cwd, config, adapter, fs, locale);
      return { locale, plurals: findIncompletePlurals(config.format, source, target, locale) };
    }),
  );
}

function describePlural(plural: IncompletePlural): string {
  const argument = plural.argument === undefined ? "" : ` {${plural.argument}}`;
  return `${plural.key}${argument} (${plural.missing.join(", ")})`;
}

function describeGaps(gaps: readonly LocalePluralGaps[]): string {
  const listed = gaps.flatMap(({ locale, plurals }) =>
    plurals.map((plural) => `${locale}: ${describePlural(plural)}`),
  );
  if (listed.length === 0) {
    return "Every target locale holds every CLDR plural category its language uses.";
  }
  const shown = listed.slice(0, LISTED_PLURALS).join("; ");
  const more = listed.length > LISTED_PLURALS ? `; and ${listed.length - LISTED_PLURALS} more` : "";
  return (
    `${listed.length} ${listed.length === 1 ? "plural lacks" : "plurals lack"} CLDR plural ` +
    `categories the target language uses: ${shown}${more}. Add the missing forms by hand; ` +
    "verbatra check lists them all."
  );
}

export async function describePluralCompleteness(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
  adapter: FormatAdapter | undefined,
): Promise<string> {
  if (!tracksPluralCategories(config.format)) {
    return `Not checked: the "${config.format}" format does not store plural forms by CLDR category.`;
  }
  if (adapter === undefined) {
    return "Not checked: the configured format resolves to no adapter.";
  }
  try {
    return describeGaps(await incompletePluralsByLocale(config, cwd, fs, adapter));
  } catch (error) {
    return `Not checked: ${errorMessage(error)}`;
  }
}

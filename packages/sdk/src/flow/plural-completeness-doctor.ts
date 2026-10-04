import { type FormatAdapter, tracksPluralCategories } from "@verbatra/format-adapters";
import { isMachineProvider } from "../config/provider-config.js";
import { kindOf } from "../config/provider-kind.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage } from "../errors.js";
import type { SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { readTarget } from "./diff-locales.js";
import { type DoctorFinding, passing, warning } from "./doctor-finding.js";
import {
  findIncompleteAbsentPlurals,
  findIncompletePlurals,
  type IncompletePlural,
} from "./plural-completeness.js";
import { readSourceResource } from "./source.js";

const LISTED_PLURALS = 10;

interface LocalePluralGaps {
  readonly locale: string;
  readonly plurals: readonly IncompletePlural[];
}

function pluralGenerationRuns(config: VerbatraConfig): boolean {
  return (
    config.format === "i18next-json" &&
    config.generatePlurals === true &&
    isMachineProvider(config.provider) &&
    kindOf(config.provider.id) === "llm"
  );
}

function compareGaps(a: IncompletePlural, b: IncompletePlural): number {
  return a.key.localeCompare(b.key) || a.ruleType.localeCompare(b.ruleType);
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
      const committed = findIncompletePlurals(config.format, source, target, locale);
      const projected = findIncompleteAbsentPlurals(
        config.format,
        source,
        target,
        locale,
        pluralGenerationRuns(config),
      );
      return { locale, plurals: [...committed, ...projected].sort(compareGaps) };
    }),
  );
}

function describePlural(plural: IncompletePlural): string {
  const argument = plural.argument === undefined ? "" : ` {${plural.argument}}`;
  return `${plural.key}${argument} (${plural.missing.join(", ")})`;
}

function describeGaps(gaps: readonly LocalePluralGaps[]): DoctorFinding {
  const listed = gaps.flatMap(({ locale, plurals }) =>
    plurals.map((plural) => `${locale}: ${describePlural(plural)}`),
  );
  if (listed.length === 0) {
    return passing("Every target locale holds every CLDR plural category its language uses.");
  }
  const shown = listed.slice(0, LISTED_PLURALS).join("; ");
  const more = listed.length > LISTED_PLURALS ? `; and ${listed.length - LISTED_PLURALS} more` : "";
  return warning(
    `${listed.length} ${listed.length === 1 ? "plural lacks" : "plurals lack"} CLDR plural ` +
      `categories the target language uses: ${shown}${more}. Add the missing forms by hand; ` +
      "verbatra check lists every gap in a plural a target already holds and counts a plural it " +
      "lacks entirely as missing keys.",
  );
}

export async function describePluralCompleteness(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
  adapter: FormatAdapter | undefined,
): Promise<DoctorFinding> {
  if (!tracksPluralCategories(config.format)) {
    return passing(
      `Not checked: the "${config.format}" format does not store plural forms by CLDR category.`,
    );
  }
  if (adapter === undefined) {
    return passing("Not checked: the configured format resolves to no adapter.");
  }
  try {
    return describeGaps(await incompletePluralsByLocale(config, cwd, fs, adapter));
  } catch (error) {
    return warning(`Not checked: ${errorMessage(error)}`);
  }
}

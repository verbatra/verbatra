import {
  createI18nextExtractor,
  createI18nextLiteralRules,
  type LiteralRules,
  SOURCE_FRAMEWORKS,
  type SourceExtractor,
  type SourceFramework,
  sourceFrameworkSchema,
} from "@verbatra/extract";
import { z } from "zod";

/**
 * The zod schema for the optional `extract` block, validated strictly so a misspelled field is
 * reported rather than silently ignored. It is embedded in {@link verbatraConfigSchema} and
 * produces {@link ExtractionConfig}.
 */
export const extractionConfigSchema = z.strictObject({
  framework: sourceFrameworkSchema,
  roots: z.array(z.string().min(1)).min(1),
  exclude: z.array(z.string().min(1)).optional(),
  literals: z
    .strictObject({
      ignore: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});

/**
 * The `extract` block of a verbatra config: which translation framework's call sites the source
 * scan looks for, which directories it walks, and which directory names it skips on the way.
 *
 * `roots` are resolved against the run's working directory, and the scan never reads outside them.
 * `exclude` adds directory names to the set that is always skipped, which already covers
 * `node_modules`, `.git`, and the usual build output directories.
 *
 * `literals.ignore` lists string literals the untranslated-literal scan (`verbatra doctor
 * --literals`) holds back project-wide, matched against the whole literal text with whitespace
 * collapsed. A held-back literal is still reported, under `suppressed`, so nothing vanishes
 * silently.
 */
export type ExtractionConfig = z.infer<typeof extractionConfigSchema>;

type ExtractorFactories = {
  [K in SourceFramework]: () => SourceExtractor;
};

const extractorFactories: ExtractorFactories = {
  i18next: () => createI18nextExtractor(),
};

export const EXTRACTION_FRAMEWORKS: readonly SourceFramework[] = SOURCE_FRAMEWORKS;

export function buildExtractor(framework: SourceFramework): SourceExtractor {
  return extractorFactories[framework]();
}

type LiteralRuleFactories = {
  [K in SourceFramework]: () => LiteralRules;
};

const literalRuleFactories: LiteralRuleFactories = {
  i18next: () => createI18nextLiteralRules(),
};

export function buildLiteralRules(framework: SourceFramework): LiteralRules {
  return literalRuleFactories[framework]();
}

export {
  findInconsistentTranslations,
  type InconsistencyGroup,
  type InconsistentTranslation,
  type InconsistentTranslationsOptions,
} from "./consistency/inconsistent-translations.js";
export { diffResources, isBlankValue } from "./diff/diff-resources.js";
export { similarityAtLeast, similarityRatio } from "./diff/similarity.js";
export type { DiffOptions, DiffResult } from "./diff/types.js";
export { contentHash } from "./hash/content-hash.js";
export { normalizeText } from "./hash/normalize-text.js";
export { stableStringHash } from "./hash/string-hash.js";
export {
  conventionalSubtags,
  type LocaleTag,
  NUMERIC_REGION,
  parseLocaleTag,
} from "./locale/locale-tag.js";
export {
  type LocaleSpelling,
  posixSpelling,
  type ScriptConvention,
  scriptConventionOf,
  splitGettextModifier,
} from "./locale/posix-spelling.js";
export {
  CUSTOM_FORMAT_PREFIX,
  type CustomFormatId,
  customFormatIdSchema,
  type FormatId,
  formatIdSchema,
  isCustomFormatId,
} from "./model/format-id.js";
export type { LocaleResource } from "./model/locale-resource.js";
export {
  PLURAL_CATEGORIES,
  type PluralCategory,
  type PluralRuleType,
} from "./model/plural-category.js";
export {
  SUPPORTED_FORMATS,
  type SupportedFormat,
  supportedFormatSchema,
} from "./model/supported-format.js";
export { type TranslationEntry, translationEntrySchema } from "./model/translation-entry.js";
export {
  isPlaceholderArgumentName,
  PLACEHOLDER_ARGUMENT_IDENTIFIER,
  PLACEHOLDER_ARGUMENT_NAME,
} from "./placeholder/argument-name.js";
export {
  foreignPlaceholderTokens,
  missingForeignPlaceholders,
  PLACEHOLDER_SYNTAXES,
  type PlaceholderSyntax,
} from "./placeholder/foreign-tokens.js";
export {
  compareInlineMarkup,
  type InlineMarkupComparison,
  type InlineMarkupOptions,
  inlineTagToken,
} from "./placeholder/inline-markup.js";
export { checkPlaceholders } from "./placeholder/integrity.js";
export { type ProtectedRun, protectedRuns } from "./placeholder/protected-runs.js";
export type { PlaceholderIntegrityResult } from "./placeholder/types.js";
export { pseudolocalizeBidiValue, pseudolocalizeValue } from "./pseudo/pseudo-transform.js";
export {
  assessBidiControls,
  type BidiControlsAssessment,
} from "./validation/bidi-controls.js";
export {
  assessValueDegeneracy,
  type ValueDegeneracyAssessment,
} from "./validation/value-degeneracy.js";

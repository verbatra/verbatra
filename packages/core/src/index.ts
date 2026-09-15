export { diffResources } from "./diff/diff-resources.js";
export { similarityAtLeast, similarityRatio } from "./diff/similarity.js";
export type { DiffOptions, DiffResult } from "./diff/types.js";
export { contentHash } from "./hash/content-hash.js";
export { normalizeText } from "./hash/normalize-text.js";
export { stableStringHash } from "./hash/string-hash.js";
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
  SUPPORTED_FORMATS,
  type SupportedFormat,
  supportedFormatSchema,
} from "./model/supported-format.js";
export { type TranslationEntry, translationEntrySchema } from "./model/translation-entry.js";
export {
  compareInlineMarkup,
  type InlineMarkupComparison,
} from "./placeholder/inline-markup.js";
export { checkPlaceholders } from "./placeholder/integrity.js";
export type { PlaceholderIntegrityResult } from "./placeholder/types.js";
export { pseudolocalizeValue } from "./pseudo/pseudo-transform.js";
export {
  assessValueDegeneracy,
  type ValueDegeneracyAssessment,
} from "./validation/value-degeneracy.js";

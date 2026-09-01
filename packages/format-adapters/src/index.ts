export type { FormatAdapter, ReadResult } from "./adapter.js";
export { createAndroidXmlAdapter } from "./android-xml/android-xml-adapter.js";
export { createAppleStringsAdapter } from "./apple-strings/apple-strings-adapter.js";
export { createArbAdapter } from "./arb/arb-adapter.js";
export { createDefaultRegistry } from "./default-registry.js";
export { AdapterError, type AdapterErrorCode } from "./errors.js";
export {
  createFlatFileAdapter,
  type FlatFileAdapterOptions,
} from "./flat/flat-file-adapter.js";
export { type AdapterFs, type BoundedReadOutcome, nodeAdapterFs } from "./fs-port.js";
export { createGettextAdapter } from "./gettext/gettext-adapter.js";
export { createI18nextJsonAdapter } from "./i18next/i18next-adapter.js";
export {
  type I18nextPluralCategory,
  isPluralKey,
  makePluralKey,
  pluralBaseKey,
  pluralCategoryOf,
} from "./i18next/plural.js";
export {
  createTreeFileAdapter,
  type TreeFileAdapterOptions,
} from "./json/tree-file-adapter.js";
export { createNextIntlJsonAdapter } from "./next-intl/next-intl-adapter.js";
export { createNgxTranslateJsonAdapter } from "./ngx-translate/ngx-translate-adapter.js";
export {
  extractPrintfPlaceholders,
  type PrintfPlaceholderOptions,
} from "./printf/printf-placeholders.js";
export { createPropertiesAdapter } from "./properties/properties-adapter.js";
export { AdapterRegistry, type AdapterResolution, type ResolveOptions } from "./registry.js";
export { createVueI18nJsonAdapter } from "./vue-i18n/vue-i18n-adapter.js";
export { createAppleXcstringsAdapter } from "./xcstrings/xcstrings-adapter.js";
export { createXliffAdapter } from "./xliff/xliff-adapter.js";
export { createYamlAdapter } from "./yaml/yaml-adapter.js";

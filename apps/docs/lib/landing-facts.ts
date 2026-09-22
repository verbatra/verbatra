import type { ProviderId, SupportedFormat } from "@verbatra/sdk";

const FORMAT_IDS: Readonly<Record<SupportedFormat, true>> = {
  "i18next-json": true,
  "vue-i18n-json": true,
  "next-intl-json": true,
  "ngx-translate-json": true,
  xliff: true,
  yaml: true,
  arb: true,
  properties: true,
  "apple-strings": true,
  "apple-xcstrings": true,
  "android-xml": true,
  "gettext-po": true,
  ini: true,
  resx: true,
};

const PROVIDER_IDS: Readonly<Record<ProviderId, true>> = {
  anthropic: true,
  openai: true,
  gemini: true,
  deepl: true,
  "google-translate": true,
  "openai-compatible": true,
};

export const FORMAT_COUNT = Object.keys(FORMAT_IDS).length;
export const PROVIDER_COUNT = Object.keys(PROVIDER_IDS).length;

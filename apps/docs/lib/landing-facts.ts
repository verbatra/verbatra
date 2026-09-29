import type { ProviderId, SupportedFormat } from "@verbatra/sdk";
import { PACKAGE_VERSION } from "./site";

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

const PROVIDER_IDS: Readonly<Record<Exclude<ProviderId, "none">, true>> = {
  anthropic: true,
  openai: true,
  gemini: true,
  deepl: true,
  "google-translate": true,
  "openai-compatible": true,
  libretranslate: true,
};

export const FORMAT_COUNT = Object.keys(FORMAT_IDS).length;
export const PROVIDER_COUNT = Object.keys(PROVIDER_IDS).length;

export type LandingFactKey = "release" | "formats" | "providers" | "license";

export const LANDING_FACTS: ReadonlyArray<{ key: LandingFactKey; value: string }> = [
  { key: "release", value: `@verbatra/cli ${PACKAGE_VERSION}` },
  { key: "formats", value: String(FORMAT_COUNT) },
  { key: "providers", value: String(PROVIDER_COUNT) },
  { key: "license", value: "MIT" },
];

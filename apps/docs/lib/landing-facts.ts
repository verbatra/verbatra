import type { ProviderId, SupportedFormat } from "@verbatra/sdk";

type FormatDisplay = { readonly label: string };

export const FORMAT_DISPLAY: Readonly<Record<SupportedFormat, FormatDisplay>> = {
  "i18next-json": { label: "i18next JSON" },
  "vue-i18n-json": { label: "vue-i18n JSON" },
  "next-intl-json": { label: "next-intl JSON" },
  "ngx-translate-json": { label: "ngx-translate JSON" },
  xliff: { label: "XLIFF" },
  yaml: { label: "YAML" },
  arb: { label: "Flutter ARB" },
  properties: { label: "Java/Spring .properties" },
  "apple-strings": { label: "Apple .strings" },
  "apple-xcstrings": { label: "Xcode String Catalog" },
  "android-xml": { label: "Android strings.xml" },
  "gettext-po": { label: "gettext .po/.pot" },
  ini: { label: "INI" },
  resx: { label: ".NET .resx" },
};

export type MachineProviderId = Exclude<ProviderId, "none">;

const PROVIDER_IDS: Readonly<Record<MachineProviderId, true>> = {
  anthropic: true,
  openai: true,
  gemini: true,
  deepl: true,
  "google-translate": true,
  "openai-compatible": true,
  libretranslate: true,
};

export const SUPPORTED_FORMAT_IDS = Object.keys(FORMAT_DISPLAY) as ReadonlyArray<SupportedFormat>;
export const MACHINE_PROVIDER_IDS = Object.keys(PROVIDER_IDS) as ReadonlyArray<MachineProviderId>;

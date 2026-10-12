import type { ProviderId, SupportedFormat } from "@verbatra/sdk";
import type { StackIconKey } from "@/components/stack-icons";

export type FormatDisplay = { readonly label: string; readonly icon: StackIconKey };

export const FORMAT_DISPLAY: Readonly<Record<SupportedFormat, FormatDisplay>> = {
  "i18next-json": { label: "i18next JSON", icon: "json" },
  "vue-i18n-json": { label: "vue-i18n JSON", icon: "vue" },
  "next-intl-json": { label: "next-intl JSON", icon: "next" },
  "ngx-translate-json": { label: "ngx-translate JSON", icon: "angular" },
  xliff: { label: "XLIFF", icon: "xliff" },
  yaml: { label: "YAML", icon: "yaml" },
  arb: { label: "Flutter ARB", icon: "flutter" },
  properties: { label: "Java/Spring .properties", icon: "spring" },
  "apple-strings": { label: "Apple .strings", icon: "apple" },
  "apple-xcstrings": { label: "Xcode String Catalog", icon: "xcode" },
  "android-xml": { label: "Android strings.xml", icon: "android" },
  "gettext-po": { label: "gettext .po/.pot", icon: "gnu" },
  ini: { label: "INI", icon: "ini" },
  resx: { label: ".NET .resx", icon: "dotnet" },
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

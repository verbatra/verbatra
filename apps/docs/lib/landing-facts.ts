import type { ProviderId, SupportedFormat } from "@verbatra/sdk";
import { LICENSE_URL, RELEASES_URL } from "@/components/landing/links";
import type { StackIconKey } from "@/components/stack-icons";
import { PACKAGE_VERSION } from "./site";

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

export const FORMAT_COUNT = SUPPORTED_FORMAT_IDS.length;
export const PROVIDER_COUNT = MACHINE_PROVIDER_IDS.length;

export type HeroCountKey = "formats" | "providers";

export type HeroReleaseFact = {
  readonly key: "version" | "license";
  readonly value: string;
  readonly href: string;
};

export type HeroCountFact = {
  readonly key: HeroCountKey;
  readonly value: number;
  readonly path: string;
};

export type HeroFact = HeroReleaseFact | HeroCountFact;

export const HERO_FACTS: ReadonlyArray<HeroFact> = [
  { key: "version", value: `v${PACKAGE_VERSION}`, href: RELEASES_URL },
  { key: "license", value: "MIT", href: LICENSE_URL },
  { key: "formats", value: FORMAT_COUNT, path: "/docs/formats" },
  { key: "providers", value: PROVIDER_COUNT, path: "/docs/providers" },
];

export function isCountFact(fact: HeroFact): fact is HeroCountFact {
  return "path" in fact;
}

export const HERO_COUNT_FACTS: ReadonlyArray<HeroCountFact> = HERO_FACTS.filter(isCountFact);

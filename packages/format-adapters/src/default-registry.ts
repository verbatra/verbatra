import { createAndroidXmlAdapter } from "./android-xml/android-xml-adapter.js";
import { createAppleStringsAdapter } from "./apple-strings/apple-strings-adapter.js";
import { createArbAdapter } from "./arb/arb-adapter.js";
import { type AdapterFs, nodeAdapterFs } from "./fs-port.js";
import { createGettextAdapter } from "./gettext/gettext-adapter.js";
import { createI18nextJsonAdapter } from "./i18next/i18next-adapter.js";
import { createNextIntlJsonAdapter } from "./next-intl/next-intl-adapter.js";
import { createNgxTranslateJsonAdapter } from "./ngx-translate/ngx-translate-adapter.js";
import { createPropertiesAdapter } from "./properties/properties-adapter.js";
import { AdapterRegistry } from "./registry.js";
import { createVueI18nJsonAdapter } from "./vue-i18n/vue-i18n-adapter.js";
import { createAppleXcstringsAdapter } from "./xcstrings/xcstrings-adapter.js";
import { createXliffAdapter } from "./xliff/xliff-adapter.js";
import { createYamlAdapter } from "./yaml/yaml-adapter.js";

export function createDefaultRegistry(fs: AdapterFs = nodeAdapterFs): AdapterRegistry {
  return new AdapterRegistry()
    .register(createI18nextJsonAdapter(fs))
    .register(createVueI18nJsonAdapter(fs))
    .register(createNextIntlJsonAdapter(fs))
    .register(createNgxTranslateJsonAdapter(fs))
    .register(createXliffAdapter(fs))
    .register(createYamlAdapter(fs))
    .register(createArbAdapter(fs))
    .register(createPropertiesAdapter(fs))
    .register(createAppleStringsAdapter(fs))
    .register(createAppleXcstringsAdapter(fs))
    .register(createAndroidXmlAdapter(fs))
    .register(createGettextAdapter(fs));
}

import { createAndroidXmlAdapter } from "./android-xml/android-xml-adapter.js";
import { createAppleStringsAdapter } from "./apple-strings/apple-strings-adapter.js";
import { createArbAdapter } from "./arb/arb-adapter.js";
import { type AdapterFs, nodeAdapterFs } from "./fs-port.js";
import { createGettextAdapter } from "./gettext/gettext-adapter.js";
import { createI18nextJsonAdapter } from "./i18next/i18next-adapter.js";
import { createIniAdapter } from "./ini/ini-adapter.js";
import { createNextIntlJsonAdapter } from "./next-intl/next-intl-adapter.js";
import { createNgxTranslateJsonAdapter } from "./ngx-translate/ngx-translate-adapter.js";
import { createPropertiesAdapter } from "./properties/properties-adapter.js";
import { AdapterRegistry } from "./registry.js";
import { createResxAdapter } from "./resx/resx-adapter.js";
import { createVueI18nJsonAdapter } from "./vue-i18n/vue-i18n-adapter.js";
import { createAppleXcstringsAdapter } from "./xcstrings/xcstrings-adapter.js";
import { createXliffAdapter } from "./xliff/xliff-adapter.js";
import { createYamlAdapter } from "./yaml/yaml-adapter.js";

/**
 * Build a registry holding every format adapter verbatra ships, in detection order. This is the
 * starting point for adding an adapter of your own: register it on the returned registry and hand
 * that registry to an SDK flow as its `adapterRegistry` dependency.
 *
 * @param fs - The file-system port every built-in adapter reads and writes through. Defaults to
 *   {@link nodeAdapterFs}.
 * @returns A registry of the built-in adapters, ready for further registrations.
 *
 * @example
 * ```ts
 * const registry = createDefaultRegistry().register(createTomlAdapter());
 * await translate({ config }, { adapterRegistry: registry });
 * ```
 */
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
    .register(createGettextAdapter(fs))
    .register(createIniAdapter(fs))
    .register(createResxAdapter(fs));
}

import { PROVIDER_KEYS_ANCHORS } from "./docs-anchors";
import { type Locale, type LocalizedAnchors, localizedAnchorPath } from "./i18n";
import { COMPARE_PATH } from "./landing-compare";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, type MachineProviderId } from "./landing-facts";
import { PLAYGROUND_METADATA } from "./landing-playground";
import { PROVIDER_DISPLAY, providerShortLabel } from "./landing-providers";
import { providerReleaseBadge, RELEASE_BADGE, versionAtLeast } from "./release-badge";
import { PACKAGE_VERSION } from "./site";

export type FaqDocsLink = { readonly page: string; readonly anchors?: LocalizedAnchors };

export const FAQ_ITEM_IDS = [
  "incremental",
  "providers",
  "npm",
  "formats",
  "ci",
  "keys",
  "privacy",
  "cost",
  "studio",
  "playground",
] as const;

export type FaqItemId = (typeof FAQ_ITEM_IDS)[number];

const PROVIDERS_PAGE: FaqDocsLink = { page: "/docs/providers" };

export const FAQ_ANSWER_LINKS: Readonly<Record<FaqItemId, FaqDocsLink>> = {
  incremental: { page: "/docs/the-lock-file" },
  providers: PROVIDERS_PAGE,
  npm: PROVIDERS_PAGE,
  formats: { page: "/docs/formats" },
  ci: { page: "/docs/github-action" },
  keys: { page: "/docs/providers", anchors: PROVIDER_KEYS_ANCHORS },
  privacy: { page: "/docs/data-handling" },
  cost: { page: "/docs/estimating-cost" },
  studio: { page: "/docs/cli/studio" },
  playground: { page: "/docs/sdk-quickstart" },
};

export const FAQ_ASIDE_LINKS = [
  { key: "quickstart", link: { page: "/docs/quickstart" } },
  { key: "keys", link: { page: "/docs/providers", anchors: PROVIDER_KEYS_ANCHORS } },
  { key: "dataHandling", link: { page: "/docs/data-handling" } },
  { key: "safety", link: { page: "/docs/translation-safety" } },
  { key: "compare", link: { page: COMPARE_PATH } },
] as const satisfies ReadonlyArray<{ key: string; link: FaqDocsLink }>;

export function faqHref(locale: Locale, link: FaqDocsLink): string {
  return localizedAnchorPath(locale, link.page, link.anchors);
}

function released(id: MachineProviderId, version: string): boolean {
  const since = providerReleaseBadge(id);
  return since === null || versionAtLeast(version, since);
}

export function publishedProviders(version: string = PACKAGE_VERSION): MachineProviderId[] {
  return MACHINE_PROVIDER_IDS.filter((id) => released(id, version));
}

export function pendingProviders(version: string = PACKAGE_VERSION): MachineProviderId[] {
  return MACHINE_PROVIDER_IDS.filter((id) => !released(id, version));
}

function listOf(locale: Locale, labels: ReadonlyArray<string>): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(labels);
}

export type FaqValues = Readonly<Record<string, string>>;

export function faqValues(
  id: FaqItemId,
  locale: Locale,
  version: string = PACKAGE_VERSION,
): FaqValues {
  switch (id) {
    case "npm": {
      const pending = pendingProviders(version);
      return {
        version,
        providers: listOf(locale, publishedProviders(version).map(providerShortLabel)),
        pending: pending.length > 0 ? "yes" : "no",
        next: RELEASE_BADGE.version,
        upcoming: listOf(locale, pending.map(providerShortLabel)),
      };
    }
    case "formats":
      return {
        formats: listOf(
          locale,
          Object.values(FORMAT_DISPLAY).map((format) => format.label),
        ),
      };
    case "playground":
      return { provider: PROVIDER_DISPLAY[PLAYGROUND_METADATA.provider].label };
    default:
      return {};
  }
}

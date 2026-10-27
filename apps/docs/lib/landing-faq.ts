import { type Locale, type LocalizedAnchors, localizedAnchorPath } from "./i18n";
import { COMPARE_PATH } from "./landing-compare";
import { MACHINE_PROVIDER_IDS, type MachineProviderId } from "./landing-facts";
import { providerShortLabel } from "./landing-providers";
import { providerReleaseBadge, RELEASE_BADGE, versionAtLeast } from "./release-badge";
import { PACKAGE_VERSION } from "./site";

type FaqDocsLink = { readonly page: string; readonly anchors?: LocalizedAnchors };

export const FAQ_ITEM_IDS = ["cost", "providers", "privacy", "ci", "incremental"] as const;

export type FaqItemId = (typeof FAQ_ITEM_IDS)[number];

export const FAQ_ANSWER_LINKS: Readonly<Record<FaqItemId, FaqDocsLink>> = {
  cost: { page: "/docs/estimating-cost" },
  providers: { page: "/docs/providers" },
  privacy: { page: "/docs/data-handling" },
  ci: { page: "/docs/github-action" },
  incremental: { page: "/docs/the-lock-file" },
};

export const FAQ_ASIDE_LINKS = [
  { key: "quickstart", link: { page: "/docs/quickstart" } },
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

type FaqValues = Readonly<Record<string, string>>;

export function faqValues(
  id: FaqItemId,
  locale: Locale,
  version: string = PACKAGE_VERSION,
): FaqValues {
  if (id !== "providers") return {};
  const pending = pendingProviders(version);
  return {
    providers: listOf(locale, publishedProviders(version).map(providerShortLabel)),
    pending: pending.length > 0 ? "yes" : "no",
    next: RELEASE_BADGE.version,
    upcoming: listOf(locale, pending.map(providerShortLabel)),
  };
}

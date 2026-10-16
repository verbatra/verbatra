import type { ReactNode } from "react";
import { LICENSE_URL } from "@/components/landing/links";
import { type Locale, localizedPath } from "@/lib/i18n";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { MACHINE_PROVIDER_IDS } from "@/lib/landing-facts";
import { providerShortLabel } from "@/lib/landing-providers";
import { providerReleaseBadge } from "@/lib/release-badge";
import { LANDING_LAST_UPDATED, PACKAGE_VERSION } from "@/lib/site";

export const HERO_FACTS_TITLE_ID = "hero-facts-title";

const LINK = "vk-prose-link";

export type HeroFactsLabels = {
  readonly title: string;
  readonly license: string;
  readonly install: string;
  readonly providers: string;
  readonly providersLink: string;
  readonly formats: string;
  readonly formatsValue: string;
  readonly requirements: string;
  readonly requirement: string;
  readonly version: string;
  readonly versionParts: string;
  readonly lastUpdated: string;
  readonly newTab: string;
  readonly availableFrom: (version: string) => string;
};

export function formatLandingDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function Fact({ id, term, children }: { id: string; term: string; children: ReactNode }) {
  return (
    <div className="vk-fact" data-fact={id}>
      <dt className="vk-fact-term">{term}</dt>
      <dd className="vk-fact-value">{children}</dd>
    </div>
  );
}

export function HeroFacts({
  labels,
  locale,
}: {
  labels: HeroFactsLabels;
  locale: Locale;
}): ReactNode {
  return (
    <div className="vk-banner-facts">
      <h2 id={HERO_FACTS_TITLE_ID} className="sr-only">
        {labels.title}
      </h2>
      <dl aria-labelledby={HERO_FACTS_TITLE_ID} className="vk-facts">
        <Fact id="license" term={labels.license}>
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            MIT<span className="sr-only"> {labels.newTab}</span>
          </a>
        </Fact>
        <Fact id="install" term={labels.install}>
          <code className="vk-fact-code">{NPM_INSTALL_COMMAND}</code>
        </Fact>
        <Fact id="providers" term={labels.providers}>
          <ul className="vk-fact-list">
            {MACHINE_PROVIDER_IDS.map((id) => {
              const badge = providerReleaseBadge(id);
              return (
                <li key={id} className="vk-fact-item" data-provider={id}>
                  {providerShortLabel(id)}
                  {badge === null ? null : (
                    <span className="vk-pill vk-fact-badge">{labels.availableFrom(badge)}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <a href={localizedPath(locale, "/docs/providers")} className={LINK}>
            {labels.providersLink}
          </a>
        </Fact>
        <Fact id="formats" term={labels.formats}>
          <a href={localizedPath(locale, "/docs/formats")} className={LINK}>
            {labels.formatsValue}
          </a>
        </Fact>
        <Fact id="requirements" term={labels.requirements}>
          {labels.requirement}
        </Fact>
        <Fact id="version" term={labels.version}>
          <code className="vk-fact-code">v{PACKAGE_VERSION}</code> {labels.versionParts}
        </Fact>
        <Fact id="updated" term={labels.lastUpdated}>
          <time dateTime={LANDING_LAST_UPDATED}>
            {formatLandingDate(LANDING_LAST_UPDATED, locale)}
          </time>
        </Fact>
      </dl>
    </div>
  );
}

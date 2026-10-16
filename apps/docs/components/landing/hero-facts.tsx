import type { ReactNode } from "react";
import { LICENSE_URL } from "@/components/landing/links";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { type Locale, localizedPath } from "@/lib/i18n";
import { LANDING_LAST_UPDATED } from "@/lib/site";

const LINK = "vk-prose-link";

export type HeroFactsLabels = {
  readonly title: string;
  readonly license: string;
  readonly providers: string;
  readonly providersValue: string;
  readonly providersLink: string;
  readonly formats: string;
  readonly formatsValue: string;
  readonly requirements: string;
  readonly requirement: string;
  readonly version: string;
  readonly versionParts: string;
  readonly lastUpdated: string;
  readonly newTab: string;
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
      <h2 className="sr-only">{labels.title}</h2>
      <dl className="vk-facts">
        <Fact id="license" term={labels.license}>
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            MIT<span className="sr-only"> {labels.newTab}</span>
          </a>
        </Fact>
        <Fact id="providers" term={labels.providers}>
          <span>{labels.providersValue}</span>
          <IntentPrefetchLink href={localizedPath(locale, "/docs/providers")} className={LINK}>
            {labels.providersLink}
          </IntentPrefetchLink>
        </Fact>
        <Fact id="formats" term={labels.formats}>
          <IntentPrefetchLink href={localizedPath(locale, "/docs/formats")} className={LINK}>
            {labels.formatsValue}
          </IntentPrefetchLink>
        </Fact>
        <Fact id="requirements" term={labels.requirements}>
          {labels.requirement}
        </Fact>
        <Fact id="version" term={labels.version}>
          {labels.versionParts}
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

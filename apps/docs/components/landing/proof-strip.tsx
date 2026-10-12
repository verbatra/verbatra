import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LiveStatValue } from "@/components/landing/islands";
import { GITHUB_URL, NPM_CLI } from "@/components/landing/links";
import { TrackedLink } from "@/components/ui/tracked-link";
import { formatCompactNumber } from "@/lib/compact-number";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { providerShortLabel } from "@/lib/landing-providers";
import { loadProjectStats, type ProjectStats } from "@/lib/project-stats";

export const PROOF_STRIP_PROVIDERS: ReadonlyArray<string> =
  MACHINE_PROVIDER_IDS.map(providerShortLabel);

export function providerList(locale: string): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(PROOF_STRIP_PROVIDERS);
}

type StatKey = "stars" | "downloads";

type StatItem = {
  readonly key: StatKey;
  readonly value: number | null;
  readonly href: string;
};

type StatsT = (
  key: StatKey | "starsFallback" | "downloadsFallback" | "providers" | "formats",
) => string;

function OutboundStat({
  item,
  t,
  locale,
}: {
  item: StatItem;
  t: StatsT;
  locale: string;
}): ReactNode {
  return (
    <li className="vk-proof-strip-item" data-stat={item.key}>
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="vk-proof-strip-link"
        data-umami-event="outbound-link"
        data-umami-event-target={item.key}
        data-umami-event-location="proof-strip"
      >
        {item.value === null ? (
          <span className="vk-proof-strip-value" data-fallback>
            {t(`${item.key}Fallback`)}
          </span>
        ) : (
          <>
            <LiveStatValue
              stat={item.key}
              initial={formatCompactNumber(item.value, locale)}
              locale={locale}
            />{" "}
            <span className="vk-proof-strip-label">{t(item.key)}</span>
          </>
        )}
      </a>
    </li>
  );
}

type FactKey = "providers" | "formats";

function FactItem({ fact, children }: { fact: FactKey; children: ReactNode }): ReactNode {
  return (
    <li className="vk-proof-strip-item vk-proof-strip-fact" data-fact={fact}>
      {children}
    </li>
  );
}

function factItems(t: StatsT, locale: Locale): ReadonlyArray<ReactNode> {
  return [
    <FactItem key="providers" fact="providers">
      <TrackedLink
        href={localizedPath(locale, "/docs/providers")}
        className="vk-proof-strip-link"
        track={{ name: "click-cta", data: { location: "proof-strip", target: "providers" } }}
      >
        <span className="vk-proof-strip-value">{providerList(locale)}</span>{" "}
        <span className="vk-proof-strip-label">{t("providers")}</span>
      </TrackedLink>
    </FactItem>,
    <FactItem key="formats" fact="formats">
      <TrackedLink
        href={localizedPath(locale, "/docs/formats")}
        className="vk-proof-strip-link"
        track={{ name: "click-cta", data: { location: "proof-strip", target: "formats" } }}
      >
        <span className="vk-proof-strip-value" data-count>
          {new Intl.NumberFormat(locale).format(SUPPORTED_FORMAT_IDS.length)}
        </span>{" "}
        <span className="vk-proof-strip-label">{t("formats")}</span>
      </TrackedLink>
    </FactItem>,
  ];
}

export async function ProofStrip({ stats }: { stats?: ProjectStats } = {}): Promise<ReactNode> {
  const t = await getTranslations("landing.stats");
  const locale = toLocale(await getLocale());
  const { stars, weeklyDownloads } = stats ?? (await loadProjectStats());
  const figures: ReadonlyArray<StatItem> = [
    { key: "stars", value: stars, href: GITHUB_URL },
    { key: "downloads", value: weeklyDownloads, href: NPM_CLI },
  ];
  const slots = [
    ...figures.map((item) => <OutboundStat key={item.key} item={item} t={t} locale={locale} />),
    ...factItems(t, locale),
  ];

  return (
    <section aria-label={t("label")} className="vk-proof-strip vk-w-wide mx-auto w-full">
      <ul
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
        role="list"
        className="vk-proof-strip-list"
      >
        {slots}
      </ul>
    </section>
  );
}

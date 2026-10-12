import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { GITHUB_URL, NPM_CLI } from "@/components/landing/links";
import { TrackedLink } from "@/components/ui/tracked-link";
import { type Locale, localizedPath } from "@/lib/i18n";
import { MACHINE_PROVIDER_IDS } from "@/lib/landing-facts";
import { PROVIDER_DISPLAY } from "@/lib/landing-providers";
import { fetchProjectStats, formatCompactNumber, type ProjectStats } from "@/lib/project-stats";

export const PROOF_STRIP_PROVIDERS: ReadonlyArray<string> = MACHINE_PROVIDER_IDS.map(
  (id) => PROVIDER_DISPLAY[id].label,
);

type StatItem = {
  readonly key: "stars" | "downloads";
  readonly value: number | null;
  readonly href: string;
};

function OutboundStat({
  item,
  value,
  label,
}: {
  item: StatItem;
  value: string;
  label: string;
}): ReactNode {
  return (
    <li className="vk-proof-strip-item">
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="vk-proof-strip-link"
        data-umami-event="outbound-link"
        data-umami-event-target={item.key}
        data-umami-event-location="proof-strip"
      >
        <span className="vk-proof-strip-value">{value}</span>{" "}
        <span className="vk-proof-strip-label">{label}</span>
      </a>
    </li>
  );
}

export async function ProofStrip({ stats }: { stats?: ProjectStats } = {}): Promise<ReactNode> {
  const t = await getTranslations("landing.stats");
  const locale = (await getLocale()) as Locale;
  const { stars, weeklyDownloads } = stats ?? (await fetchProjectStats());
  const items: ReadonlyArray<StatItem> = [
    { key: "stars", value: stars, href: GITHUB_URL },
    { key: "downloads", value: weeklyDownloads, href: NPM_CLI },
  ];

  return (
    <section aria-label={t("label")} className="vk-proof-strip vk-w-wide mx-auto w-full">
      <ul
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
        role="list"
        className="vk-proof-strip-list"
      >
        {items.map((item) =>
          item.value === null ? null : (
            <OutboundStat
              key={item.key}
              item={item}
              value={formatCompactNumber(item.value, locale)}
              label={t(item.key)}
            />
          ),
        )}
        <li className="vk-proof-strip-item vk-proof-strip-providers">
          <TrackedLink
            href={localizedPath(locale, "/docs/providers")}
            className="vk-proof-strip-link"
            track={{ name: "click-cta", data: { location: "proof-strip", target: "providers" } }}
          >
            <span className="vk-proof-strip-value">{PROOF_STRIP_PROVIDERS.join(", ")}</span>{" "}
            <span className="vk-proof-strip-label">{t("providers")}</span>
          </TrackedLink>
        </li>
      </ul>
    </section>
  );
}

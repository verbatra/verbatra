import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { type Locale, localizedPath } from "@/lib/i18n";
import { COMPARE_LAST_CHECKED, COMPARE_TOOLS } from "@/lib/landing-compare";
import { formatLandingDate } from "@/lib/landing-date";
import { homePath } from "@/lib/site";
import { CompareMatrix, ComparePairs, toolName } from "./compare-table";
import { ComparePicker } from "./islands";

const COMPARE_HEADING_ID = "compare-page-heading";

export const COMPARE_NEXT_ID = "compare-next";

export async function ComparePage({ locale }: { locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "landing.compare" });
  const page = await getTranslations({ locale, namespace: "compare" });
  const checked = formatLandingDate(COMPARE_LAST_CHECKED, locale);
  const options = COMPARE_TOOLS.filter((tool) => tool !== "verbatra").map((tool) => ({
    id: tool,
    name: toolName(t, tool),
  }));

  return (
    <article
      aria-labelledby={COMPARE_HEADING_ID}
      className="vk-compare-page vk-gutter vk-w-wide vk-pad-top-md mx-auto grid grid-cols-[minmax(0,1fr)] pb-(--section-md)"
    >
      <header className="vk-compare-intro">
        <h1 id={COMPARE_HEADING_ID} className="vk-compare-title">
          {page("heading")}
        </h1>
        <p data-takeaway="" className="vk-compare-takeaway">
          {page("takeaway")}
        </p>
        <p data-scope="">{page("scope")}</p>
        <p data-stronger="">{page("stronger")}</p>
        <p data-last-checked="" className="vk-compare-checked">
          {`${t("lastChecked")} `}
          <time dateTime={COMPARE_LAST_CHECKED}>{checked}</time>
        </p>
        <a href={`#${COMPARE_NEXT_ID}`} className="vk-compare-skip vk-prose-link" data-skip="">
          {page("skip")}
        </a>
      </header>
      <div className="vk-compare not-prose">
        <ComparePicker label={page("pickerLabel")} options={options} />
        <div className="vk-compare-matrix">
          <CompareMatrix t={t} locale={locale} caption={page("caption")} />
        </div>
        <ComparePairs t={t} locale={locale} />
      </div>
      <nav id={COMPARE_NEXT_ID} aria-labelledby="compare-next-heading" className="vk-compare-next">
        <h2 id="compare-next-heading" className="vk-h4 text-(--text-strong)">
          {page("nextHeading")}
        </h2>
        <ul className="flex flex-wrap gap-x-8 gap-y-2 text-base">
          <li>
            <IntentPrefetchLink
              href={localizedPath(locale, "/docs/quickstart")}
              className="vk-prose-link"
            >
              {page("quickstart")}
            </IntentPrefetchLink>
          </li>
          <li>
            <IntentPrefetchLink href={homePath(locale)} className="vk-prose-link">
              {page("home")}
            </IntentPrefetchLink>
          </li>
        </ul>
      </nav>
    </article>
  );
}

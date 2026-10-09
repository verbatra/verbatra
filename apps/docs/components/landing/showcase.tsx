import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type Locale, localizedPath } from "@/lib/i18n";
import { showcaseRows, showcaseSeed } from "@/lib/showcase-scenarios";
import { Section } from "./section";
import { SectionHead } from "./section-head";
import { ShowcaseTabs } from "./showcase-tabs";
import { TryIt } from "./try-it";

const SHOWCASE_HEADING_ID = "showcase-heading";

export async function Showcase(): Promise<ReactNode> {
  const t = await getTranslations("landing.showcase");
  const locale = (await getLocale()) as Locale;

  return (
    <Section width="wide" rhythm="sm" id="showcase" className="vk-showcase-section">
      <SectionHead id={SHOWCASE_HEADING_ID} title={t("heading")} lead={t("lead")} />
      <ShowcaseTabs studioHref={localizedPath(locale, "/docs/review-in-studio")}>
        <TryIt seed={showcaseSeed()} rows={showcaseRows()} />
      </ShowcaseTabs>
    </Section>
  );
}

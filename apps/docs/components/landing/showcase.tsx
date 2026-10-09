import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { showcaseRows, showcaseSeed } from "@/lib/showcase-scenarios";
import { Section } from "./section";
import { SectionHead } from "./section-head";
import { TryIt } from "./try-it";

const SHOWCASE_HEADING_ID = "showcase-heading";

export async function Showcase(): Promise<ReactNode> {
  const t = await getTranslations("landing.showcase");

  return (
    <Section width="wide" rhythm="sm" id="showcase" className="vk-showcase-section">
      <SectionHead id={SHOWCASE_HEADING_ID} title={t("heading")} lead={t("lead")} />
      <div className="vk-showcase not-prose">
        <TryIt seed={showcaseSeed()} rows={showcaseRows()} />
      </div>
    </Section>
  );
}

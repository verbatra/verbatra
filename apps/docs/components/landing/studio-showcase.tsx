import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StudioScreenshot } from "@/components/studio-screenshot";
import { type Locale, localizedPath } from "@/lib/i18n";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function StudioShowcase(): Promise<ReactNode> {
  const t = await getTranslations("landing.studio");
  const locale = (await getLocale()) as Locale;

  return (
    <Section id="studio" rhythm="lg">
      <SectionHead title={t("heading")} lead={t("lead")} />
      <div className="mt-10">
        <StudioScreenshot shot="translations" alt={t("alt")} caption={t("caption")} />
      </div>
      <a
        href={localizedPath(locale, "/docs/review-in-studio")}
        className="mt-6 inline-flex min-h-6 items-center gap-2 text-sm text-fd-muted-foreground underline decoration-fd-border underline-offset-4 transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)]"
      >
        {t("cta")}
        <span aria-hidden="true">→</span>
      </a>
    </Section>
  );
}

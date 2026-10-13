import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PrefetchAfterPaintLink } from "@/components/ui/prefetch-after-paint-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import {
  LANDING_SHOWCASE_CODE,
  LANDING_SHOWCASE_TABS,
  type LandingShowcaseTab,
} from "@/lib/landing-code";
import { CodeFrame } from "./code-frame";
import { CodeShowcaseTabs } from "./islands";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const CODE_SHOWCASE_PAGES: Readonly<Record<LandingShowcaseTab, string>> = {
  cli: "/docs/cli",
  sdk: "/docs/sdk-quickstart",
  config: "/docs/config-file",
  action: "/docs/github-action",
};

const LINK_CLASS =
  "vk-tap inline-flex items-center font-medium text-(--accent) underline decoration-[color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-current";

export async function CodeShowcase(): Promise<ReactNode> {
  const t = await getTranslations("landing.code");
  const locale = toLocale(await getLocale());
  const tabs = await Promise.all(
    LANDING_SHOWCASE_TABS.map(async (id) => {
      const sample = LANDING_SHOWCASE_CODE[id];
      const frame = await CodeFrame({
        code: sample.code,
        lang: sample.language,
        filename: sample.filename,
        copy: { label: t("copy") },
      });
      return {
        id,
        label: t(`tabs.${id}`),
        panel: (
          <div className="grid gap-4" data-panel={id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <p className="max-w-[60ch] text-sm leading-relaxed text-(--text-muted)">
                {t(`captions.${id}`)}
              </p>
              <PrefetchAfterPaintLink
                href={localizedPath(locale, CODE_SHOWCASE_PAGES[id])}
                className={LINK_CLASS}
              >
                {t(`links.${id}`)}
              </PrefetchAfterPaintLink>
            </div>
            {frame}
          </div>
        ),
      };
    }),
  );
  return (
    <Section id="code" band>
      <SectionHead id="code-heading" layout="stacked" title={t("heading")} lead={t("lead")} />
      <div data-reveal="2" className="mt-10 lg:mt-14">
        <CodeShowcaseTabs label={t("tablist")} tabs={tabs} />
      </div>
    </Section>
  );
}

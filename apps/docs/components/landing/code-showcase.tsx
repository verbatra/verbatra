import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { TrackedLink } from "@/components/ui/tracked-link";
import { type Locale, localizedPath } from "@/lib/i18n";
import {
  LANDING_SHOWCASE_CODE,
  LANDING_SHOWCASE_TABS,
  type LandingShowcaseTab,
} from "@/lib/landing-code";
import { CodeFrame } from "./code-frame";
import { CODE_SHOWCASE_LOCATION, CodeShowcaseTabs } from "./code-showcase-tabs";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const CODE_SHOWCASE_PAGES: Readonly<Record<LandingShowcaseTab, string>> = {
  cli: "/docs/cli",
  sdk: "/docs/sdk-quickstart",
  config: "/docs/config-file",
  action: "/docs/github-action",
};

const LINK_CLASS =
  "font-medium text-(--accent) underline decoration-[color-mix(in_srgb,var(--v-glow)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-current";

export async function CodeShowcase(): Promise<ReactNode> {
  const t = await getTranslations("landing.code");
  const locale = (await getLocale()) as Locale;
  const tabs = await Promise.all(
    LANDING_SHOWCASE_TABS.map(async (id) => {
      const sample = LANDING_SHOWCASE_CODE[id];
      const frame = await CodeFrame({
        code: sample.code,
        lang: sample.language,
        filename: sample.filename,
        copy: { label: t("copy"), location: CODE_SHOWCASE_LOCATION },
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
              <TrackedLink
                href={localizedPath(locale, CODE_SHOWCASE_PAGES[id])}
                className={LINK_CLASS}
                track={{
                  name: "click-cta",
                  data: { location: CODE_SHOWCASE_LOCATION, target: id },
                }}
              >
                {t(`links.${id}`)}
              </TrackedLink>
            </div>
            {frame}
          </div>
        ),
      };
    }),
  );
  return (
    <Section id="code" band>
      <SectionHead id="code-heading" title={t("heading")} lead={t("lead")} reveal />
      <div data-reveal="2" className="mt-10 lg:mt-14">
        <CodeShowcaseTabs label={t("tablist")} tabs={tabs} />
      </div>
    </Section>
  );
}

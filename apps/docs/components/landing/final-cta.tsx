import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { Backdrop } from "./fx/backdrop";
import { GithubIcon } from "./github-icon";
import { GITHUB_URL } from "./links";
import { SectionHead } from "./section-head";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.finalClose");
  const tHero = await getTranslations("landing.hero");
  const locale = (await getLocale()) as Locale;
  return (
    <section className="vk-rhythm-lg vk-pad-lg relative overflow-hidden border-t border-fd-border">
      <Backdrop
        gridFade="radial-gradient(ellipse 60% 90% at 50% 50%, #000 30%, transparent 75%)"
        beams={false}
        spotlightFill="var(--v-purple)"
        sparkleDensity={0.00012}
      />
      <div className="vk-gutter vk-w-hero relative mx-auto text-center">
        <SectionHead align="center" maxWidth="640px" title={t("heading")} lead={t("lead")} />
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            href={localizedPath(locale, "/docs/your-first-translation")}
            variant="primary"
            size="lg"
            trailingArrow
          >
            {tHero("ctaQuickstart")}
          </Button>
          <Button href={GITHUB_URL} variant="secondary" size="lg">
            <GithubIcon size={18} />
            {tHero("ctaGithub")}
          </Button>
        </div>
      </div>
    </section>
  );
}

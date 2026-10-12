import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CommandPanel } from "@/components/landing/command-panel";
import { HeroTerminal } from "@/components/landing/hero-terminal";
import { GITHUB_URL } from "@/components/landing/links";
import Button, { buttonClasses } from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";

export const HERO_TITLE_ID = "hero-title";

export async function Hero(): Promise<ReactNode> {
  const t = await getTranslations("landing.banner");
  const tCommand = await getTranslations("landing.hero.command");
  const locale = (await getLocale()) as Locale;

  return (
    <section aria-labelledby={HERO_TITLE_ID} className="vk-banner vk-w-wide mx-auto w-full">
      <div aria-hidden="true" className="vk-banner-backdrop" />
      <div className="vk-banner-grid">
        <div className="vk-banner-copy">
          <h1 id={HERO_TITLE_ID} className="vk-banner-title">
            {t("headline")}
          </h1>
          <p className="vk-banner-lead">{t("lead")}</p>
          <div className="vk-banner-ctas">
            <Button
              href={localizedPath(locale, "/docs/quickstart")}
              variant="primary"
              size="lg"
              track={{ name: "click-cta", data: { location: "hero", target: "get-started" } }}
            >
              {t("ctaPrimary")}
            </Button>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("secondary", "lg")}
              data-umami-event="outbound-link"
              data-umami-event-target="github"
              data-umami-event-location="hero"
            >
              {t("ctaSecondary")}
            </a>
          </div>
          <div className="vk-banner-install">
            <CommandPanel
              labels={{
                tablist: t("installLabel"),
                install: tCommand("install"),
                prompt: tCommand("prompt"),
                installHint: tCommand("installHint"),
                promptHint: tCommand("promptHint"),
              }}
            />
          </div>
        </div>
        <div className="vk-banner-demo">
          <div aria-hidden="true" className="vk-banner-glow" />
          <HeroTerminal session={t("terminalLabel")} replay={t("replay")} />
        </div>
      </div>
    </section>
  );
}

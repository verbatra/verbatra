import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CommandPanel } from "@/components/landing/command-panel";
import { SITE_MESSAGES_URL } from "@/components/landing/links";
import Button from "@/components/ui/button";
import { heroLocaleRows } from "@/lib/hero-lines";
import { type Locale, localizedPath } from "@/lib/i18n";
import { HERO_NUMBERS, type HeroNumberKey, VERSION_LINE } from "@/lib/landing-facts";

function HeroNumbers({ labels }: { labels: Readonly<Record<HeroNumberKey, string>> }): ReactNode {
  return (
    <div className="vk-hero-numbers-row">
      <ul
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
        role="list"
        className="vk-hero-numbers"
      >
        {HERO_NUMBERS.map((number) => (
          <li key={number.key} className="vk-hero-number">
            <span className="vk-hero-number-value">{number.value}</span>
            <span className="vk-hero-number-label">{labels[number.key]}</span>
          </li>
        ))}
      </ul>
      <p className="vk-hero-release">{VERSION_LINE}</p>
    </div>
  );
}

export async function LandingHero(): Promise<ReactNode> {
  const t = await getTranslations("landing.hero");
  const locale = (await getLocale()) as Locale;

  return (
    <section data-presence="hero" className="vk-hero vk-w-wide mx-auto w-full">
      <div className="vk-hero-lines">
        <div className="vk-hero-line">
          <span aria-hidden="true" className="vk-hero-code vk-hero-code-source">
            {locale}
          </span>
          <h1 className="vk-hero-title">{t("headline")}</h1>
        </div>
        <ul
          // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
          role="list"
          className="vk-hero-locales"
        >
          {heroLocaleRows(locale).map((row) => (
            <li key={row.locale} lang={row.locale} className="vk-hero-line vk-hero-locale">
              <span aria-hidden="true" className="vk-hero-code">
                {row.locale}
              </span>
              <span>{row.headline}</span>
            </li>
          ))}
        </ul>
        <p className="vk-hero-caption">
          {t("dogfood")}{" "}
          <a
            href={SITE_MESSAGES_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="vk-prose-link"
            data-umami-event="outbound-link"
            data-umami-event-target="site-messages"
            data-umami-event-location="hero"
          >
            {t("dogfoodLink")}
          </a>
        </p>
      </div>
      <div className="vk-hero-body">
        <div className="vk-hero-intro">
          <p className="vk-lead vk-hero-lead">{t("lead")}</p>
          <Button
            href={localizedPath(locale, "/docs/quickstart")}
            variant="primary"
            size="lg"
            track={{ name: "click-cta", data: { location: "hero", target: "get-started" } }}
          >
            {t("ctaStart")}
          </Button>
        </div>
        <div className="vk-hero-panel">
          <CommandPanel
            labels={{
              tablist: t("command.tablist"),
              install: t("command.install"),
              prompt: t("command.prompt"),
              installHint: t("command.installHint"),
              promptHint: t("command.promptHint"),
            }}
          />
        </div>
        <HeroNumbers
          labels={{
            formats: t("numbers.formats"),
            providers: t("numbers.providers"),
            locales: t("numbers.locales"),
          }}
        />
      </div>
    </section>
  );
}

import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CommandPanel } from "@/components/landing/command-panel";
import { HeroDemo } from "@/components/landing/hero-demo";
import { SITE_MESSAGES_URL } from "@/components/landing/links";
import Button from "@/components/ui/button";
import { heroLocaleRows } from "@/lib/hero-lines";
import { type Locale, localizedPath } from "@/lib/i18n";
import { HERO_NUMBERS, type HeroNumberKey, VERSION_LINE } from "@/lib/landing-facts";

const DEMO_RISE_DELAY = "360ms";
const DEMO_HALO =
  "radial-gradient(ellipse 50% 60% at 50% 40%, color-mix(in srgb, var(--v-purple) 30%, transparent), transparent 70%)";

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
    <section className="vk-hero mx-auto w-full max-w-(--width-layout)">
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
          >
            {t("dogfoodLink")}
          </a>
        </p>
      </div>
      <div className="vk-hero-body">
        <div className="vk-hero-intro">
          <p className="vk-lead vk-hero-lead">{t("lead")}</p>
          <Button href={localizedPath(locale, "/docs/quickstart")} variant="primary" size="lg">
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
      <div
        className="vk-rise relative mx-auto mt-14 w-full min-w-0 max-w-3xl md:mt-16"
        style={{ animationDelay: DEMO_RISE_DELAY }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[8%] -top-10 bottom-1/3"
          style={{ background: DEMO_HALO }}
        />
        <div className="relative">
          <HeroDemo
            labels={{
              tablist: t("demo.tablistLabel"),
              cli: t("demo.cli"),
              studio: t("demo.studio"),
              studioAlt: t("demo.studioAlt"),
              session: t("demo.sessionLabel"),
              captionCli: t("demo.caption"),
              captionStudio: t("demo.captionStudio"),
            }}
          />
        </div>
      </div>
    </section>
  );
}

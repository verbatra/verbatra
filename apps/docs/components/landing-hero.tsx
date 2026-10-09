import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CommandPanel } from "@/components/landing/command-panel";
import { GRID_PATTERN_STYLE } from "@/components/landing/fx/grid-pattern";
import { SITE_MESSAGES_URL } from "@/components/landing/links";
import { LocaleLedger } from "@/components/landing/locale-ledger";
import Button from "@/components/ui/button";
import { TrackedLink } from "@/components/ui/tracked-link";
import { type Locale, localizedPath } from "@/lib/i18n";
import { HERO_FACTS, type HeroCountKey, isCountFact } from "@/lib/landing-facts";

function HeroFacts({
  locale,
  labels,
}: {
  locale: Locale;
  labels: Readonly<Record<HeroCountKey, string>>;
}): ReactNode {
  return (
    <ul
      // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
      role="list"
      className="vk-hero-facts"
    >
      {HERO_FACTS.map((fact) => (
        <li key={fact.key} className="vk-hero-fact">
          {isCountFact(fact) ? (
            <TrackedLink
              href={localizedPath(locale, fact.path)}
              className="vk-hero-fact-link"
              track={{ name: "click-cta", data: { location: "hero", target: fact.key } }}
            >
              <span className="vk-hero-fact-value">{fact.value}</span> {labels[fact.key]}
            </TrackedLink>
          ) : (
            <a
              href={fact.href}
              target="_blank"
              rel="noreferrer noopener"
              className="vk-hero-fact-link"
              data-umami-event="outbound-link"
              data-umami-event-target={fact.key}
              data-umami-event-location="hero"
            >
              <span className="vk-hero-fact-value">{fact.value}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export async function LandingHero(): Promise<ReactNode> {
  const t = await getTranslations("landing.hero");
  const locale = (await getLocale()) as Locale;

  return (
    <section data-presence="hero" className="vk-hero vk-w-wide mx-auto w-full">
      <div aria-hidden="true" className="vk-hero-blueprint" style={GRID_PATTERN_STYLE} />
      <div className="vk-hero-main">
        <div className="vk-hero-copy">
          <h1 className="vk-hero-title">{t("headline")}</h1>
          <p className="vk-lead vk-hero-lead">{t("lead")}</p>
          <div className="vk-hero-ctas">
            <Button
              href={localizedPath(locale, "/docs/quickstart")}
              variant="primary"
              size="lg"
              track={{ name: "click-cta", data: { location: "hero", target: "get-started" } }}
            >
              {t("ctaStart")}
            </Button>
            <Button
              href="#showcase"
              variant="secondary"
              size="lg"
              track={{ name: "click-cta", data: { location: "hero", target: "showcase" } }}
            >
              {t("ctaTry")}
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
          <HeroFacts
            locale={locale}
            labels={{ formats: t("facts.formats"), providers: t("facts.providers") }}
          />
        </div>
        <LocaleLedger
          locale={locale}
          caption={
            <>
              {t("ledger.caption")} {t("dogfood")}{" "}
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
            </>
          }
        />
      </div>
    </section>
  );
}

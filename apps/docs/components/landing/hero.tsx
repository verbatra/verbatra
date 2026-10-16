import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { HeroDiff } from "@/components/landing/hero-diff";
import { HeroFacts } from "@/components/landing/hero-facts";
import { CommandPanel, HeroTerminal } from "@/components/landing/islands";
import { GITHUB_URL } from "@/components/landing/links";
import Button, { buttonClasses } from "@/components/ui/button";
import { localizedPath, toLocale } from "@/lib/i18n";
import { SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { nodeVersionsLabel } from "@/lib/node-requirement";
import { MCP_VERSION, NODE_RANGE, STUDIO_VERSION } from "@/lib/site";

export const HERO_TITLE_ID = "hero-title";

export async function Hero(): Promise<ReactNode> {
  const t = await getTranslations("landing.banner");
  const tCommand = await getTranslations("landing.hero.command");
  const tMarks = await getTranslations("landing.showcase.tryIt.marks");
  const tFacts = await getTranslations("landing.facts");
  const tOpen = await getTranslations("landing.openSource");
  const locale = toLocale(await getLocale());

  return (
    <section aria-labelledby={HERO_TITLE_ID} className="vk-banner vk-w-wide mx-auto w-full">
      <div aria-hidden="true" className="vk-banner-backdrop" />
      <div className="vk-banner-grid">
        <div className="vk-banner-copy">
          <p className="vk-banner-eyebrow">{t("eyebrow")}</p>
          <h1 id={HERO_TITLE_ID} className="vk-banner-title">
            {t("headline")}
          </h1>
          <p className="vk-banner-lead">{t("lead")}</p>
          <p className="vk-banner-summary">
            {t("quotes.what")} {t("quotes.how")}
          </p>
          <div className="vk-banner-ctas">
            <Button href={localizedPath(locale, "/docs/quickstart")} variant="primary" size="lg">
              {t("ctaPrimary")}
            </Button>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("secondary", "lg")}
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
          <HeroDiff
            label={t("diffLabel")}
            marks={{ missing: tMarks("missing"), filled: tMarks("new") }}
          />
          <HeroTerminal
            session={t("terminalLabel")}
            replay={t("replay")}
            example={t("terminalExample")}
          />
        </div>
        <HeroFacts
          locale={locale}
          labels={{
            title: tFacts("label"),
            license: tFacts("license"),
            install: tFacts("install"),
            providers: tFacts("providers"),
            providersLink: tFacts("providersLink"),
            formats: tFacts("formats"),
            formatsValue: tFacts("formatsValue", { count: SUPPORTED_FORMAT_IDS.length }),
            requirements: tFacts("requirements"),
            requirement: t("nodeRequirement", {
              versions: nodeVersionsLabel(NODE_RANGE, locale, (major, minimum) =>
                t("nodeMajorFrom", { major, minimum }),
              ),
            }),
            version: tFacts("version"),
            versionParts: tFacts("versionParts", { studio: STUDIO_VERSION, mcp: MCP_VERSION }),
            lastUpdated: tFacts("lastUpdated"),
            newTab: tOpen("newTab"),
            availableFrom: (version) => tFacts("availableFrom", { version }),
          }}
        />
      </div>
    </section>
  );
}

import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CommandPanel, HeroTerminal } from "@/components/landing/islands";
import { GITHUB_URL } from "@/components/landing/links";
import Button, { buttonClasses } from "@/components/ui/button";
import { localizedPath, toLocale } from "@/lib/i18n";
import { nodeVersionsLabel } from "@/lib/node-requirement";
import { NODE_RANGE } from "@/lib/site";

export const HERO_TITLE_ID = "hero-title";

export async function Hero(): Promise<ReactNode> {
  const t = await getTranslations("landing.banner");
  const tCommand = await getTranslations("landing.hero.command");
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
            <p className="vk-banner-requirement">
              {t("nodeRequirement", {
                versions: nodeVersionsLabel(NODE_RANGE, locale, (major, minimum) =>
                  t("nodeMajorFrom", { major, minimum }),
                ),
              })}
            </p>
          </div>
        </div>
        <div className="vk-banner-demo">
          <div aria-hidden="true" className="vk-banner-glow" />
          <HeroTerminal
            session={t("terminalLabel")}
            replay={t("replay")}
            example={t("terminalExample")}
          />
        </div>
      </div>
    </section>
  );
}

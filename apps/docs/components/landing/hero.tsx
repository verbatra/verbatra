import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CommandRow } from "@/components/landing/islands";
import { releaseUrl } from "@/components/landing/links";
import { NewAnnouncement } from "@/components/new-pill";
import Button from "@/components/ui/button";
import { localizedPath, toLocale } from "@/lib/i18n";
import { HERO_INSTALL_COMMAND } from "@/lib/install-commands";
import {
  HERO_BACK_LOCALES,
  HERO_FILE_ADDED_COUNT,
  HERO_FRONT_LOCALE,
  heroFileLines,
  heroFileName,
  heroFilePreview,
} from "@/lib/landing-hero-files";
import { PACKAGE_VERSION } from "@/lib/site";

export const HERO_TITLE_ID = "hero-title";

function LocaleFiles({ keysAdded }: { keysAdded: string }): ReactNode {
  return (
    <div aria-hidden="true" className="vk-banner-files">
      {HERO_BACK_LOCALES.map((code) => (
        <div key={code} className="vk-banner-file" data-locale={code}>
          <p className="vk-banner-file-name">{heroFileName(code)}</p>
          <p className="vk-banner-file-line" lang={code}>
            {heroFilePreview(code)}
          </p>
        </div>
      ))}
      <div className="vk-banner-file" data-locale={HERO_FRONT_LOCALE} data-front="true">
        <p className="vk-banner-file-name">
          <span>{heroFileName(HERO_FRONT_LOCALE)}</span>
          <span className="vk-banner-file-badge">{keysAdded}</span>
        </p>
        <div className="vk-banner-file-body" lang={HERO_FRONT_LOCALE}>
          {heroFileLines(HERO_FRONT_LOCALE).map((line) => (
            <p
              key={line.id}
              className="vk-banner-file-line"
              data-added={line.added ? "true" : undefined}
            >
              {line.added ? `+ ${line.text}` : line.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export async function Hero(): Promise<ReactNode> {
  const t = await getTranslations("landing.banner");
  const tInstall = await getTranslations("landing.install");
  const tOpen = await getTranslations("landing.openSource");
  const locale = toLocale(await getLocale());

  return (
    <section aria-labelledby={HERO_TITLE_ID} className="vk-banner">
      <div aria-hidden="true" className="vk-banner-halo" />
      <div className="vk-banner-grid vk-gutter vk-w-wide mx-auto w-full">
        <div className="vk-banner-copy">
          <NewAnnouncement
            href={releaseUrl(PACKAGE_VERSION)}
            badge={t("announcement.badge")}
            newTab={tOpen("newTab")}
          >
            {t("announcement.text", { version: PACKAGE_VERSION })}
          </NewAnnouncement>
          <h1 id={HERO_TITLE_ID} className="vk-banner-title">
            {t.rich("headline", {
              accent: (chunks) => <span className="vk-banner-title-lit">{chunks}</span>,
            })}
          </h1>
          <p className="vk-banner-lead">{t("lead")}</p>
          <div className="vk-banner-ctas">
            <Button href={localizedPath(locale, "/docs/quickstart")} variant="primary" size="lg">
              {t("ctaPrimary")}
            </Button>
            <div className="vk-banner-install">
              <CommandRow
                command={HERO_INSTALL_COMMAND}
                label={tInstall("copyAria")}
                wrap="narrow"
              />
            </div>
          </div>
        </div>
        <div className="vk-banner-demo">
          <LocaleFiles keysAdded={t("keysAdded", { count: HERO_FILE_ADDED_COUNT })} />
        </div>
      </div>
    </section>
  );
}

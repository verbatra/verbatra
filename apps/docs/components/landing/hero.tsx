import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { HeroTrackView } from "@/components/landing/hero-tracks";
import { HeroTracks } from "@/components/landing/islands";
import { GITHUB_URL, LICENSE_URL, releaseUrl } from "@/components/landing/links";
import { NewAnnouncement } from "@/components/new-pill";
import Button, { buttonClasses } from "@/components/ui/button";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";
import { LANDING_TRACK_IDS, LANDING_TRACKS } from "@/lib/landing-tracks";
import { nodeVersionsLabel } from "@/lib/node-requirement";
import { NODE_RANGE, PACKAGE_VERSION } from "@/lib/site";

export const HERO_TITLE_ID = "hero-title";

async function trackViews(locale: Locale): Promise<ReadonlyArray<HeroTrackView>> {
  const t = await getTranslations("landing.hero.tracks");
  return LANDING_TRACK_IDS.map((id) => {
    const track = LANDING_TRACKS[id];
    return {
      id,
      tab: t(`${id}.tab`),
      summary: t(`${id}.summary`),
      link: t(`${id}.link`),
      href: localizedPath(locale, track.docsPath),
      title: track.terminalTitle,
      commands: track.commands,
      result: track.result,
      files: track.files.map(({ filename, code }) => ({ filename, code })),
      exit:
        track.exitCode === null
          ? null
          : { code: track.exitCode, label: t("exitCode", { code: track.exitCode }) },
    };
  });
}

export async function Hero(): Promise<ReactNode> {
  const t = await getTranslations("landing.banner");
  const tTracks = await getTranslations("landing.hero.tracks");
  const tOpen = await getTranslations("landing.openSource");
  const locale = toLocale(await getLocale());
  const tracks = await trackViews(locale);
  const requirement = t("nodeRequirement", {
    versions: nodeVersionsLabel(NODE_RANGE, locale, (major, minimum) =>
      t("nodeMajorFrom", { major, minimum }),
    ),
  });

  return (
    <section aria-labelledby={HERO_TITLE_ID} className="vk-banner vk-w-wide mx-auto w-full">
      <div className="vk-banner-grid">
        <div className="vk-banner-copy">
          <NewAnnouncement
            href={releaseUrl(PACKAGE_VERSION)}
            badge={t("announcement.badge")}
            newTab={tOpen("newTab")}
          >
            {t("announcement.text", { version: PACKAGE_VERSION })}
          </NewAnnouncement>
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
              <span className="sr-only"> {tOpen("newTab")}</span>
            </a>
          </div>
          <p className="vk-banner-trust">
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="vk-prose-link"
            >
              {t("license")}
              <span className="sr-only"> {tOpen("newTab")}</span>
            </a>{" "}
            <span>{requirement}</span>
          </p>
        </div>
        <div className="vk-banner-demo">
          <HeroTracks tracks={tracks} label={tTracks("label")} />
        </div>
      </div>
    </section>
  );
}

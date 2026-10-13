import type { ReactNode } from "react";
import { GithubIcon } from "@/components/landing/github-icon";
import { GITHUB_URL, RELEASES_URL } from "@/components/landing/links";
import { NAV_TEXT_LINK } from "@/components/nav-link-classes";
import { SiteWordmark } from "@/components/site-wordmark";
import { buttonClasses } from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { LIVE_COUNT_SLOT } from "@/lib/live-count";
import { homeNavValue } from "@/lib/locale-home-layout";
import { loadProjectStats } from "@/lib/project-stats";

export async function StaticSiteHeader({ locale }: { locale: Locale }): Promise<ReactNode> {
  const { stars } = await loadProjectStats();
  const { docsUrl, quickstartUrl, labels, stars: count } = await homeNavValue(locale, stars);
  const starsSuffix = labels.starsAria.split(LIVE_COUNT_SLOT)[1] ?? "";
  return (
    <header
      id="nd-nav"
      data-static-header=""
      className="vk-header sticky top-0 z-40 flex flex-col backdrop-blur-sm"
    >
      <div className="vk-header-row mx-auto flex h-14 w-full max-w-(--width-wide) items-center gap-2 px-(--gutter)">
        <div className="vk-header-start flex flex-1 items-center">
          <a
            href={localizedPath(locale, "/")}
            className="vk-tap inline-flex items-center gap-2.5 font-semibold"
          >
            <SiteWordmark />
          </a>
        </div>
        <div className="flex flex-1 items-center justify-end md:gap-2 md:ps-4">
          <nav aria-label={labels.label} className="flex items-center gap-6 max-md:hidden md:me-4">
            <a href={docsUrl} className={`vk-tap ${NAV_TEXT_LINK}`}>
              {labels.docs}
            </a>
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`vk-tap ${NAV_TEXT_LINK}`}
            >
              {labels.changelog}
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`vk-tap inline-flex items-center gap-1.5 ${NAV_TEXT_LINK}`}
            >
              <GithubIcon size={16} />
              <span>{labels.github}</span>
              {count === null ? null : (
                <>
                  {" "}
                  <span className="vk-nav-stars" style={{ minInlineSize: `${count.length}ch` }}>
                    {count}
                  </span>
                  <span className="sr-only">{starsSuffix}</span>
                </>
              )}
            </a>
          </nav>
          <a
            href={quickstartUrl}
            className={buttonClasses("primary", "sm", "vk-tap vk-nav-cta whitespace-nowrap")}
            style={{ background: "var(--accent-fill)" }}
          >
            {labels.getStarted}
          </a>
        </div>
      </div>
    </header>
  );
}

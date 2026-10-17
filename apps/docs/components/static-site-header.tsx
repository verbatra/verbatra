import type { ReactNode } from "react";
import {
  GitHubLinkBody,
  githubLinkClass,
  HEADER_CLASS,
  HeaderEnd,
  HeaderNav,
  HeaderRow,
  HeaderStart,
  MenuIcon,
  WORDMARK_LINK_CLASS,
} from "@/components/header-parts";
import { GITHUB_URL, RELEASES_URL } from "@/components/landing/links";
import {
  GET_STARTED_CLASS,
  GET_STARTED_STYLE,
  MENU_TRIGGER,
  NAV_TEXT_LINK,
  SHEET_ITEM,
} from "@/components/nav-link-classes";
import { SiteWordmark } from "@/components/site-wordmark";
import { buttonClasses } from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { LIVE_COUNT_SLOT } from "@/lib/live-count";
import { homeNavValue } from "@/lib/locale-home-layout";
import { loadProjectStats } from "@/lib/project-stats";
import { cn } from "@/lib/utils";

type NavLinksProps = {
  docsUrl: string;
  labels: { docs: string; changelog: string; github: string; newTab: string };
  stars: string | null;
  starsSuffix: string;
  className: string;
};

function NavLinks({ docsUrl, labels, stars, starsSuffix, className }: NavLinksProps): ReactNode {
  return (
    <>
      <a href={docsUrl} className={className}>
        {labels.docs}
      </a>
      <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className={className}>
        {labels.changelog}
        <span className="sr-only"> {labels.newTab}</span>
      </a>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={githubLinkClass(className)}
      >
        <GitHubLinkBody
          label={labels.github}
          stars={stars}
          reserved={stars}
          starsSuffix={starsSuffix}
        />
        <span className="sr-only"> {labels.newTab}</span>
      </a>
    </>
  );
}

export async function StaticSiteHeader({ locale }: { locale: Locale }): Promise<ReactNode> {
  const { stars } = await loadProjectStats();
  const { docsUrl, quickstartUrl, labels, stars: count } = await homeNavValue(locale, stars);
  const starsSuffix = labels.starsAria.split(LIVE_COUNT_SLOT)[1] ?? "";
  const links = { docsUrl, labels, stars: count, starsSuffix };
  return (
    <header id="nd-nav" data-static-header="" className={cn(HEADER_CLASS, "top-0 z-40")}>
      <HeaderRow width="wide">
        <HeaderStart>
          <a href={localizedPath(locale, "/")} className={WORDMARK_LINK_CLASS}>
            <SiteWordmark />
          </a>
        </HeaderStart>
        <HeaderEnd>
          <HeaderNav label={labels.label}>
            <NavLinks {...links} className={NAV_TEXT_LINK} />
          </HeaderNav>
          <a
            href={quickstartUrl}
            className={buttonClasses("primary", "sm", GET_STARTED_CLASS)}
            style={GET_STARTED_STYLE}
          >
            {labels.getStarted}
          </a>
          <details className="relative flex items-center md:hidden">
            <summary className={cn(MENU_TRIGGER, "list-none [&::-webkit-details-marker]:hidden")}>
              <MenuIcon />
              <span className="sr-only">{labels.menuOpen}</span>
            </summary>
            <nav
              aria-label={labels.label}
              className="absolute end-0 top-full z-50 mt-2 flex min-w-56 flex-col gap-0.5 rounded-xl border border-(--border-default) bg-(--surface-card) p-2 text-[0.9375rem] shadow-(--shadow-panel)"
            >
              <NavLinks {...links} className={cn("vk-tap", SHEET_ITEM)} />
            </nav>
          </details>
        </HeaderEnd>
      </HeaderRow>
    </header>
  );
}

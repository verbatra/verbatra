import type { ReactNode } from "react";
import {
  HEADER_CLASS,
  HeaderEnd,
  HeaderNav,
  HeaderRow,
  HeaderStart,
  MenuIcon,
  WORDMARK_LINK_CLASS,
} from "@/components/header-parts";
import { MENU_TRIGGER, NAV_TEXT_LINK, SHEET_ITEM } from "@/components/nav-link-classes";
import { SiteWordmark } from "@/components/site-wordmark";
import { type NavLink, navLinks } from "@/lib/header-links";
import { type Locale, localizedPath } from "@/lib/i18n";
import { homeNavValue } from "@/lib/locale-home-layout";
import { cn } from "@/lib/utils";

type NavLinksProps = {
  links: ReadonlyArray<NavLink>;
  newTab: string;
  className: string;
};

function NavLinks({ links, newTab, className }: NavLinksProps): ReactNode {
  return links.map(({ href, text, external }) => (
    <a
      key={href}
      href={href}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {text}
      {external ? <span className="sr-only"> {newTab}</span> : null}
    </a>
  ));
}

export async function StaticSiteHeader({ locale }: { locale: Locale }): Promise<ReactNode> {
  const { links: items, labels } = await homeNavValue(locale);
  const links = navLinks(items);
  return (
    <header id="nd-nav" data-static-header="" className={cn(HEADER_CLASS, "top-0 z-40")}>
      <HeaderRow>
        <HeaderStart>
          <a href={localizedPath(locale, "/")} className={WORDMARK_LINK_CLASS}>
            <SiteWordmark />
          </a>
        </HeaderStart>
        <HeaderEnd>
          <HeaderNav label={labels.label}>
            <NavLinks links={links} newTab={labels.newTab} className={NAV_TEXT_LINK} />
          </HeaderNav>
          <details className="relative flex items-center md:hidden">
            <summary className={cn(MENU_TRIGGER, "list-none [&::-webkit-details-marker]:hidden")}>
              <MenuIcon />
              <span className="sr-only">{labels.menuOpen}</span>
            </summary>
            <nav
              aria-label={labels.label}
              className="absolute end-0 top-full z-50 mt-2 flex min-w-56 flex-col gap-0.5 rounded-xl border border-(--border-default) bg-(--surface-card) p-2 text-[0.9375rem] shadow-(--shadow-panel)"
            >
              <NavLinks links={links} newTab={labels.newTab} className={cn("vk-tap", SHEET_ITEM)} />
            </nav>
          </details>
        </HeaderEnd>
      </HeaderRow>
    </header>
  );
}

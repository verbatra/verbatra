import { Button, Icon, ThemeToggle } from "@verbatra/ui";
import type { ThemeMode } from "@verbatra/ui/theme";
import type { ReactNode, Ref } from "react";
import type { PageId } from "../client/routes.js";
import { GithubGlyph } from "./GithubGlyph.js";
import { HeaderSearch } from "./HeaderSearch.js";
import { LiveIndicator } from "./LiveIndicator.js";
import { THEME_LABELS, themeStore } from "./lib/theme-dom.js";
import { NavLink } from "./NavLink.js";
import { DOCS_URL, GITHUB_URL, NAV_GROUPS, PAGE_LABELS } from "./nav-groups.js";

function describeThemeAction(current: ThemeMode, next: ThemeMode): string {
  return `Theme: ${THEME_LABELS[current]}. Switch to ${THEME_LABELS[next]}.`;
}

const ICON_LINK =
  "hidden size-8 items-center justify-center rounded-(--radius-md) text-(--text-muted) transition-colors hover:bg-(--surface-hover) hover:text-(--text-strong) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Wordmark(): ReactNode {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 4 L12 20 L20 4"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-(--text-strong)">verbatra</span>{" "}
      <span className="sr-only">Studio</span>
    </span>
  );
}

export interface AppHeaderProps {
  readonly activePage: PageId;
  readonly pageBadges: Readonly<Partial<Record<PageId, number>>>;
  readonly onOpenMenu: () => void;
  readonly activeLinkRef?: Ref<HTMLAnchorElement>;
}

export function AppHeader({
  activePage,
  pageBadges,
  onOpenMenu,
  activeLinkRef,
}: AppHeaderProps): ReactNode {
  const waiting = pageBadges.review ?? 0;
  return (
    <header className="sticky top-0 z-10 flex-none bg-(--surface-chrome) backdrop-blur-sm after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-(--border-default) after:content-['']">
      <div
        data-page-width=""
        className="mx-auto flex h-14 w-full max-w-(--page-max) items-center gap-2 px-4 md:px-8"
      >
        <div className="flex flex-1 items-center pe-4">
          <a
            href="#/translations"
            className="inline-flex items-center rounded-(--radius-md) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Wordmark />
          </a>
        </div>
        <HeaderSearch
          label="Keys"
          className="mx-auto hidden w-full max-w-64 md:block lg:max-w-80"
        />
        <div className="flex flex-1 items-center justify-end md:gap-2 md:ps-4">
          <nav aria-label="Studio" className="hidden items-center gap-5 xl:me-2 xl:flex">
            {NAV_GROUPS.flatMap((group) => group.pages).map((page) => (
              <NavLink
                key={page}
                page={page}
                label={PAGE_LABELS[page]}
                active={page === activePage}
                count={pageBadges[page]}
                variant="header"
                linkRef={page === activePage ? activeLinkRef : undefined}
              />
            ))}
          </nav>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Documentation (opens in a new tab)"
            className={`${ICON_LINK} xl:inline-flex`}
          >
            <Icon name="book" size={18} />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub (opens in a new tab)"
            className={`${ICON_LINK} xl:inline-flex`}
          >
            <GithubGlyph />
          </a>
          <LiveIndicator />
          <ThemeToggle
            store={themeStore}
            label={describeThemeAction}
            announce={(mode) => `Theme set to ${THEME_LABELS[mode]}`}
          />
          <Button
            variant="ghost"
            className="relative p-1.5 max-md:min-h-11 max-md:min-w-11 xl:hidden"
            aria-label={waiting > 0 ? `Open navigation, ${waiting} waiting` : "Open navigation"}
            onClick={onOpenMenu}
          >
            <Icon name="menu" />
            {waiting > 0 ? (
              <span
                aria-hidden="true"
                data-count-dot=""
                className="absolute end-1 top-1 size-2 rounded-full bg-primary"
              />
            ) : null}
          </Button>
        </div>
      </div>
    </header>
  );
}

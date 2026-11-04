import { Button, Icon, ThemeToggle } from "@verbatra/ui";
import type { ThemeMode } from "@verbatra/ui/theme";
import type { ReactNode } from "react";
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
  "inline-flex size-8 items-center justify-center rounded-(--radius-md) text-(--text-muted) transition-colors hover:bg-(--surface-hover) hover:text-(--text-strong) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
      <span className="text-lg font-semibold tracking-tight text-(--text-strong)">verbatra</span>
      <span className="font-mono text-[11px] font-semibold uppercase tracking-(--tracking-wide) text-(--text-muted)">
        Studio
      </span>
    </span>
  );
}

export interface AppHeaderProps {
  readonly activePage: PageId;
  readonly pageBadges: Readonly<Partial<Record<PageId, number>>>;
  readonly onOpenMenu: () => void;
}

export function AppHeader({ activePage, pageBadges, onOpenMenu }: AppHeaderProps): ReactNode {
  return (
    <header className="sticky top-0 z-10 flex-none border-b border-(--border-default) bg-(--surface-chrome) backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:px-6">
        <a
          href="#/translations"
          className="inline-flex flex-none items-center rounded-(--radius-md) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Wordmark />
        </a>
        <HeaderSearch className="mx-auto hidden min-w-24 max-w-xs flex-1 md:block" />
        <nav
          aria-label="Studio"
          className="ms-auto hidden flex-none items-center gap-5 md:me-2 md:flex"
        >
          {NAV_GROUPS.flatMap((group) => group.pages).map((page) => (
            <NavLink
              key={page}
              page={page}
              label={PAGE_LABELS[page]}
              active={page === activePage}
              count={pageBadges[page]}
              variant="header"
            />
          ))}
        </nav>
        <div className="ms-auto flex flex-none items-center gap-1 md:ms-0">
          <LiveIndicator />
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Documentation (opens in a new tab)"
            className={`${ICON_LINK} hidden lg:inline-flex`}
          >
            <Icon name="book" size={18} />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub (opens in a new tab)"
            className={`${ICON_LINK} hidden lg:inline-flex`}
          >
            <GithubGlyph />
          </a>
          <ThemeToggle
            store={themeStore}
            label={describeThemeAction}
            announce={(mode) => `Theme set to ${THEME_LABELS[mode]}`}
          />
          <Button
            variant="ghost"
            className="min-h-11 min-w-11 p-1.5 md:hidden"
            aria-label="Open navigation"
            onClick={onOpenMenu}
          >
            <Icon name="menu" />
          </Button>
        </div>
      </div>
    </header>
  );
}

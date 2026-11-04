import { Icon, Sheet, useDialogA11y } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { PageId } from "../client/routes.js";
import { GithubGlyph } from "./GithubGlyph.js";
import { HeaderSearch } from "./HeaderSearch.js";
import { NavLink } from "./NavLink.js";
import { DOCS_URL, GITHUB_URL, NAV_GROUPS, PAGE_ICONS, PAGE_LABELS } from "./nav-groups.js";

const EXTERNAL_LINK =
  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-start text-(--text-muted) transition-colors hover:bg-(--surface-hover) hover:text-(--text-strong) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export interface NavDrawerProps {
  readonly activePage: PageId;
  readonly pageBadges: Readonly<Partial<Record<PageId, number>>>;
  readonly onClose: () => void;
}

export function NavDrawer({ activePage, pageBadges, onClose }: NavDrawerProps): ReactNode {
  const containerRef = useDialogA11y<HTMLDivElement>({ isOpen: true, onClose });

  return (
    <div className="md:hidden">
      <Sheet
        side="start"
        title="Menu"
        ariaLabel="Navigation"
        closeLabel="Close navigation"
        onClose={onClose}
        containerRef={containerRef}
      >
        <HeaderSearch className="mb-4" onSearch={onClose} />
        {NAV_GROUPS.map((group) => (
          <nav key={group.label} aria-label={group.label} className="mb-4 flex flex-col gap-1">
            <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-(--tracking-wide) text-(--text-muted)">
              {group.label}
            </p>
            {group.pages.map((page) => (
              <NavLink
                key={page}
                page={page}
                label={PAGE_LABELS[page]}
                icon={PAGE_ICONS[page]}
                active={page === activePage}
                count={pageBadges[page]}
                variant="drawer"
                onNavigate={onClose}
              />
            ))}
          </nav>
        ))}
        <nav
          aria-label="Help"
          className="flex flex-col gap-1 border-t border-(--border-default) pt-3"
        >
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className={EXTERNAL_LINK}>
            <Icon name="book" className="flex-none" />
            Documentation
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={EXTERNAL_LINK}>
            <GithubGlyph />
            GitHub
          </a>
        </nav>
      </Sheet>
    </div>
  );
}

import { DialogCloseButton, Icon, type IconName, OverlayBackdrop } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { PageId } from "../client/routes.js";
import { cn } from "./lib/cn.js";
import { Tooltip } from "./Tooltip.js";
import { useDialogA11y } from "./use-dialog-a11y.js";

export interface SidebarNavProps {
  readonly workPages: readonly PageId[];
  readonly referencePages: readonly PageId[];
  readonly pageLabels: Readonly<Record<PageId, string>>;
  readonly pageIcons: Readonly<Record<PageId, IconName>>;
  readonly pageBadges?: Readonly<Partial<Record<PageId, number>>>;
  readonly activePage: PageId;
  readonly onSelectPage: (page: PageId) => void;
}

function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export interface DesktopSidebarProps extends SidebarNavProps {
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
}

function navItemClassName(isActive: boolean, collapsed: boolean): string {
  return cn(
    "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-muted transition-colors",
    collapsed && "justify-center px-0",
    "hover:bg-sidebar-accent hover:text-sidebar-foreground",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-active",
    isActive && "bg-sidebar-accent text-sidebar-foreground",
    isActive &&
      !collapsed &&
      "before:absolute before:start-0 before:top-1/2 before:h-[1.1em] before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-active before:content-['']",
  );
}

function SidebarBrand({ collapsed = false }: { readonly collapsed?: boolean }): ReactNode {
  return (
    <div className={cn("flex items-center gap-2.5 py-2", collapsed ? "justify-center" : "px-2.5")}>
      <span
        className="grid size-7 flex-none place-items-center rounded-md bg-sidebar-active text-xs font-bold text-primary-foreground"
        aria-hidden="true"
      >
        V
      </span>
      {collapsed ? null : (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-sidebar-foreground">Verbatra</span>
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-sidebar-muted">
            Localization Studio
          </span>
        </span>
      )}
    </div>
  );
}

function ZoneLabel({
  children,
  collapsed,
}: {
  readonly children: string;
  readonly collapsed: boolean;
}): ReactNode {
  if (collapsed) {
    return null;
  }
  return (
    <p className="mb-1 mt-0 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted/80">
      {children}
    </p>
  );
}

function NavItem({
  page,
  label,
  icon,
  isActive,
  collapsed,
  badge,
  onSelect,
}: {
  readonly page: PageId;
  readonly label: string;
  readonly icon: IconName;
  readonly isActive: boolean;
  readonly collapsed: boolean;
  readonly badge?: number | undefined;
  readonly onSelect: (page: PageId) => void;
}): ReactNode {
  const count = badge !== undefined && badge > 0 ? badge : undefined;
  const countedLabel = count === undefined ? label : `${label}, ${count} waiting`;
  const button = (
    <button
      type="button"
      aria-current={isActive ? "page" : undefined}
      aria-label={collapsed ? countedLabel : undefined}
      className={navItemClassName(isActive, collapsed)}
      onClick={() => onSelect(page)}
    >
      <Icon name={icon} className="flex-none" />
      {collapsed ? null : <span className="truncate">{label}</span>}
      {count !== undefined && !collapsed ? (
        <>
          <span
            className="ms-auto rounded-full bg-sidebar-active px-1.5 py-px font-mono text-[10px] font-bold tabular-nums text-primary-foreground"
            aria-hidden="true"
          >
            {formatBadgeCount(count)}
          </span>
          <span className="sr-only">, {count} waiting</span>
        </>
      ) : null}
      {count !== undefined && collapsed ? (
        <span
          className="absolute -end-0.5 -top-0.5 min-w-4 rounded-full bg-sidebar-active px-1 text-center font-mono text-[10px] font-bold leading-4 tabular-nums text-primary-foreground"
          aria-hidden="true"
        >
          {formatBadgeCount(count)}
        </span>
      ) : null}
    </button>
  );
  if (!collapsed) {
    return button;
  }
  return <Tooltip label={countedLabel}>{button}</Tooltip>;
}

function NavList({
  pages,
  navLabel,
  collapsed,
  ...itemProps
}: {
  readonly pages: readonly PageId[];
  readonly navLabel: string;
  readonly collapsed: boolean;
  readonly pageLabels: Readonly<Record<PageId, string>>;
  readonly pageIcons: Readonly<Record<PageId, IconName>>;
  readonly pageBadges?: Readonly<Partial<Record<PageId, number>>> | undefined;
  readonly activePage: PageId;
  readonly onSelectPage: (page: PageId) => void;
}): ReactNode {
  return (
    <nav className="flex flex-col gap-1" aria-label={navLabel}>
      <ZoneLabel collapsed={collapsed}>{navLabel}</ZoneLabel>
      {pages.map((page) => (
        <NavItem
          key={page}
          page={page}
          label={itemProps.pageLabels[page]}
          icon={itemProps.pageIcons[page]}
          isActive={page === itemProps.activePage}
          collapsed={collapsed}
          badge={itemProps.pageBadges?.[page]}
          onSelect={itemProps.onSelectPage}
        />
      ))}
    </nav>
  );
}

function HelpLinks({ collapsed }: { readonly collapsed: boolean }): ReactNode {
  const links: ReadonlyArray<{
    readonly label: string;
    readonly href: string;
    readonly icon: IconName;
  }> = [
    { label: "Documentation", href: "https://verbatra.kreitz-webdev.de", icon: "book" },
    {
      label: "Help and issues",
      href: "https://github.com/verbatra/verbatra/issues",
      icon: "help",
    },
  ];
  return (
    <nav className="flex flex-col gap-1" aria-label="Help">
      {links.map((link) => {
        const anchor = (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            aria-label={collapsed ? link.label : undefined}
            className={navItemClassName(false, collapsed)}
          >
            <Icon name={link.icon} className="flex-none" />
            {collapsed ? null : <span className="truncate">{link.label}</span>}
          </a>
        );
        if (!collapsed) {
          return anchor;
        }
        return (
          <Tooltip label={link.label} key={link.label}>
            {anchor}
          </Tooltip>
        );
      })}
    </nav>
  );
}

function CollapseToggle({
  collapsed,
  onToggleCollapsed,
}: {
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
}): ReactNode {
  const buttonClassName = cn(
    navItemClassName(false, collapsed),
    "justify-start",
    collapsed && "justify-center",
  );
  if (collapsed) {
    return (
      <Tooltip label="Expand sidebar">
        <button
          type="button"
          className={buttonClassName}
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          aria-expanded={false}
        >
          <Icon name="panel" className="flex-none" />
        </button>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={onToggleCollapsed}
      aria-label="Collapse sidebar"
      aria-expanded={true}
    >
      <Icon name="panel" className="flex-none" />
      Collapse
    </button>
  );
}

export function DesktopSidebar({
  collapsed,
  onToggleCollapsed,
  ...navProps
}: DesktopSidebarProps): ReactNode {
  return (
    <aside
      className={cn(
        "hidden flex-none flex-col border-e border-sidebar-border bg-sidebar py-4 transition-[width] duration-200 md:flex",
        collapsed ? "w-14 px-2" : "w-60 px-3",
      )}
    >
      <SidebarBrand collapsed={collapsed} />
      <div className={cn("mt-5 min-h-0 flex-1", !collapsed && "overflow-y-auto")}>
        <NavList
          pages={navProps.workPages}
          navLabel="Workspace"
          collapsed={collapsed}
          {...navProps}
        />
        <div className="mt-5">
          <NavList
            pages={navProps.referencePages}
            navLabel="Reference"
            collapsed={collapsed}
            {...navProps}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-sidebar-border pt-3">
        <HelpLinks collapsed={collapsed} />
        <CollapseToggle collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      </div>
    </aside>
  );
}

export function MobileNavDrawer({
  onClose,
  ...navProps
}: SidebarNavProps & {
  readonly onClose: () => void;
}): ReactNode {
  const containerRef = useDialogA11y<HTMLDivElement>({ isOpen: true, onClose });

  return (
    <div className="fixed inset-0 z-20 flex md:hidden">
      <OverlayBackdrop onClose={onClose} label="Close navigation" />
      <div
        className="relative z-10 flex h-full w-64 flex-col gap-6 bg-sidebar px-3 py-4 shadow-panel-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        ref={containerRef}
      >
        <div className="flex items-center justify-between gap-2">
          <SidebarBrand />
          <DialogCloseButton
            onClose={onClose}
            label="Close navigation"
            className="flex-none p-1.5 text-sidebar-muted hover:not-disabled:bg-sidebar-accent hover:not-disabled:text-sidebar-foreground"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList
            pages={navProps.workPages}
            navLabel="Workspace"
            collapsed={false}
            {...navProps}
          />
          <div className="mt-5">
            <NavList
              pages={navProps.referencePages}
              navLabel="Reference"
              collapsed={false}
              {...navProps}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1 border-t border-sidebar-border pt-3">
          <HelpLinks collapsed={false} />
        </div>
      </div>
    </div>
  );
}

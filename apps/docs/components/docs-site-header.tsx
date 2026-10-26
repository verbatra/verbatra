"use client";

import { usePathname } from "fumadocs-core/framework";
import { useSidebar } from "fumadocs-ui/components/sidebar/base";
import { useNotebookLayout } from "fumadocs-ui/layouts/notebook";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { DocsCrumbBar } from "@/components/docs-crumb-bar";
import { MENU_TRIGGER } from "@/components/nav-link-classes";
import { useRootTabs } from "@/components/root-tabs";
import {
  HEADER_TRAILING,
  ICON_BUTTON,
  ICON_PROPS,
  SiteHeaderFrame,
} from "@/components/site-header";
import { useDrawerContainment } from "@/components/use-drawer-containment";
import { useDrawerEscape } from "@/components/use-drawer-escape";
import { isLinkItemActive } from "@/lib/link-items";
import { headerActiveTab, isRootTabLinkActive } from "@/lib/root-tabs";
import { cn } from "@/lib/utils";

function SidebarIcon(): ReactNode {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

export function DocsSiteHeader(props: ComponentProps<"header">): ReactNode {
  const { slots, navItems, isNavTransparent } = useNotebookLayout();
  const sidebar = slots.sidebar;
  const sidebarState = useSidebar();
  const { open } = sidebarState;
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDrawerEscape(sidebarState, triggerRef);
  useDrawerContainment(sidebarState, triggerRef);
  const { tabs, active } = useRootTabs();
  const pathname = usePathname();
  const activeTab = headerActiveTab(navItems, tabs, active, (item) =>
    isLinkItemActive(item, pathname),
  );
  return (
    <SiteHeaderFrame
      id="nd-subnav"
      data-transparent={isNavTransparent && !open}
      data-sheet-open={open}
      {...props}
      className={cn(
        "top-(--fd-docs-row-1) z-10 [grid-area:header] layout:[--fd-header-height:var(--header-height)] max-md:layout:[--fd-header-height:calc(var(--header-height)+var(--crumb-height))]",
        props.className,
      )}
      slots={slots}
      navItems={navItems}
      activeOverride={(url) => isRootTabLinkActive(url, tabs, activeTab)}
      subBar={
        <DocsCrumbBar>
          <sidebar.trigger ref={triggerRef} className={MENU_TRIGGER}>
            <SidebarIcon />
          </sidebar.trigger>
        </DocsCrumbBar>
      }
      trailing={
        <sidebar.collapseTrigger className={cn(ICON_BUTTON, HEADER_TRAILING)}>
          <SidebarIcon />
        </sidebar.collapseTrigger>
      }
    />
  );
}

"use client";

import { usePathname } from "fumadocs-core/framework";
import { useSidebar } from "fumadocs-ui/components/sidebar/base";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { useNotebookLayout } from "fumadocs-ui/layouts/notebook";
import { isLinkItemActive } from "fumadocs-ui/layouts/shared";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { MENU_TRIGGER } from "@/components/home-nav";
import { useRootTabs } from "@/components/root-tabs";
import { ICON_PROPS, SiteHeaderFrame } from "@/components/site-header";
import { useDrawerEscape } from "@/components/use-drawer-escape";
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
  const { tabs, active } = useRootTabs();
  const pathname = usePathname();
  const activeTab = headerActiveTab(navItems, tabs, active, (item) =>
    isLinkItemActive(item, pathname),
  );
  return (
    <SiteHeaderFrame
      id="nd-subnav"
      data-transparent={isNavTransparent && !open}
      {...props}
      className={cn(
        "top-(--fd-docs-row-1) z-10 [grid-area:header] layout:[--fd-header-height:--spacing(14)]",
        props.className,
      )}
      slots={slots}
      navItems={navItems}
      activeOverride={(url) => isRootTabLinkActive(url, tabs, activeTab)}
      mobileTrigger={
        <sidebar.trigger ref={triggerRef} className={MENU_TRIGGER}>
          <SidebarIcon />
        </sidebar.trigger>
      }
      trailing={
        <sidebar.collapseTrigger
          className={cn(
            buttonVariants({ variant: "secondary", size: "icon-sm" }),
            "-me-1.5 rounded-full text-fd-muted-foreground",
          )}
        >
          <SidebarIcon />
        </sidebar.collapseTrigger>
      }
    />
  );
}

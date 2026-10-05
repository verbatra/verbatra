"use client";

import Link from "fumadocs-core/link";
import { useTreeContext } from "fumadocs-ui/contexts/tree";
import { createContext, type ReactNode, useContext } from "react";
import { activeRootTab, type RootTab } from "@/lib/root-tabs";

const RootTabsContext = createContext<ReadonlyArray<RootTab>>([]);

export function RootTabsProvider({
  tabs,
  children,
}: {
  tabs: ReadonlyArray<RootTab>;
  children: ReactNode;
}): ReactNode {
  return <RootTabsContext value={tabs}>{children}</RootTabsContext>;
}

export function useRootTabs(): { tabs: ReadonlyArray<RootTab>; active: RootTab | undefined } {
  const tabs = useContext(RootTabsContext);
  const { root } = useTreeContext();
  return { tabs, active: activeRootTab(tabs, root.$id) };
}

export function SidebarTabs(): ReactNode {
  const { tabs, active } = useRootTabs();
  if (tabs.length === 0) return null;
  return (
    <div className="vk-sidebar-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.url}
          className="vk-sidebar-tab vk-label"
          aria-current={tab === active ? "true" : undefined}
        >
          {tab.title}
        </Link>
      ))}
    </div>
  );
}

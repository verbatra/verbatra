"use client";

import { type ComponentType, type ReactNode, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { trackUmamiEvent } from "@/lib/umami";

export type CodeShowcaseTab = { id: string; label: string; panel: ReactNode };

export const CODE_SHOWCASE_LOCATION = "code";

type PanelComponent = ComponentType<{ active: boolean; children: ReactNode }>;

export function loadMotionPanel(): Promise<PanelComponent> {
  return import("./code-showcase-motion").then((module) => module.MotionPanel);
}

function StaticPanel({ children }: { active: boolean; children: ReactNode }): ReactNode {
  return <div>{children}</div>;
}

function useMotionPanel(): [PanelComponent, () => void] {
  const [Panel, setPanel] = useState<PanelComponent | null>(null);
  const requested = useRef(false);
  const request = () => {
    if (requested.current) return;
    requested.current = true;
    loadMotionPanel().then(
      (loaded) => setPanel(() => loaded),
      () => {
        requested.current = false;
      },
    );
  };
  return [Panel ?? StaticPanel, request];
}

export function CodeShowcaseTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: ReadonlyArray<CodeShowcaseTab>;
}): ReactNode {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const [Panel, requestMotion] = useMotionPanel();
  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        requestMotion();
        setActive(value);
        trackUmamiEvent("select-tab", { tab: value, location: CODE_SHOWCASE_LOCATION });
      }}
      onPointerEnter={requestMotion}
      onFocus={requestMotion}
      className="gap-6"
    >
      <TabsList
        variant="line"
        aria-label={label}
        className="w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-fd-border p-0"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="min-h-11 flex-none rounded-none px-3 text-sm font-medium text-(--text-muted) hover:text-(--text-strong) focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring) data-[state=active]:text-(--text-strong) after:bg-(--accent)"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          forceMount
          className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--focus-ring) data-[state=inactive]:hidden"
        >
          <Panel active={tab.id === active}>{tab.panel}</Panel>
        </TabsContent>
      ))}
    </Tabs>
  );
}

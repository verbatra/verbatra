"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";

export type CodeShowcaseTab = { id: string; label: string; panel: ReactNode };

type Fade = (element: HTMLElement) => void;

let fade: Promise<Fade | null> | undefined;

function requestFade(): Promise<Fade | null> {
  fade ??= import("./code-showcase-fade").then(
    (module) => module.fadeInPanel,
    () => {
      fade = undefined;
      return null;
    },
  );
  return fade;
}

function Panel({ active, children }: { active: boolean; children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(active);
  useEffect(() => {
    const wasShown = shown.current;
    shown.current = active;
    const element = ref.current;
    if (!active || wasShown || !element || !fade) return;
    void fade.then((run) => run?.(element));
  }, [active]);
  return <div ref={ref}>{children}</div>;
}

export function CodeShowcaseTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: ReadonlyArray<CodeShowcaseTab>;
}): ReactNode {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        void requestFade();
        setActive(value);
      }}
      onPointerEnter={() => void requestFade()}
      onFocus={() => void requestFade()}
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

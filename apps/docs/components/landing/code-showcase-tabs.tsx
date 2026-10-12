"use client";

import { m, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { loadMotionFeatures, MotionProvider } from "@/components/motion-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { CODE_SHOWCASE_LOCATION } from "@/lib/landing-code";
import { trackUmamiEvent } from "@/lib/umami";

export type CodeShowcaseTab = { id: string; label: string; panel: ReactNode };

const PANEL_FADE = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;

let requestFeatures: () => void = () => undefined;
const featuresRequested = new Promise<void>((resolve) => {
  requestFeatures = resolve;
});

function featuresOnFirstReach() {
  return featuresRequested.then(loadMotionFeatures);
}

function Panel({ active, children }: { active: boolean; children: ReactNode }): ReactNode {
  const reduced = useReducedMotion();
  return (
    <m.div
      initial={false}
      animate={{ opacity: active ? 1 : 0, y: active ? 0 : 4 }}
      transition={reduced ? { duration: 0 } : PANEL_FADE}
    >
      {children}
    </m.div>
  );
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
    <MotionProvider features={featuresOnFirstReach}>
      <Tabs
        value={active}
        onValueChange={(value) => {
          requestFeatures();
          setActive(value);
          trackUmamiEvent("select-tab", { tab: value, location: CODE_SHOWCASE_LOCATION });
        }}
        onPointerEnter={requestFeatures}
        onFocus={requestFeatures}
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
    </MotionProvider>
  );
}

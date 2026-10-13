"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { TabList, tabPanelProps } from "@/components/ui/tabs";

type CodeShowcaseTab = { id: string; label: string; panel: ReactNode };

type Fade = (element: HTMLElement) => void;

const CODE_SHOWCASE_ID = "code-showcase";

const TAB_LIST_CLASS =
  "inline-flex w-full items-center gap-1 overflow-x-auto border-b border-(--border-default)";

const TAB_CLASS =
  "inline-flex min-h-11 flex-none items-center justify-center gap-1.5 whitespace-nowrap border border-transparent px-3 py-1 text-sm font-medium transition-[color,background-color,border-color,box-shadow] focus-visible:border-(--focus-ring) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)";

const PANEL_CLASS =
  "min-w-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--focus-ring) data-[active=false]:hidden";

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
    <div
      role="none"
      className="flex flex-col gap-6"
      onPointerEnter={() => void requestFade()}
      onFocus={() => void requestFade()}
    >
      <TabList
        tabs={tabs}
        active={active}
        onSelect={(id) => {
          void requestFade();
          setActive(id);
        }}
        ariaLabel={label}
        idPrefix={CODE_SHOWCASE_ID}
        className={TAB_LIST_CLASS}
        tabClassName={TAB_CLASS}
      />
      {tabs.map((tab) => (
        <div
          key={tab.id}
          {...tabPanelProps(CODE_SHOWCASE_ID, tab.id, active)}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a tab panel is a tab stop in the WAI-ARIA tabs pattern
          tabIndex={0}
          className={PANEL_CLASS}
        >
          <Panel active={tab.id === active}>{tab.panel}</Panel>
        </div>
      ))}
    </div>
  );
}

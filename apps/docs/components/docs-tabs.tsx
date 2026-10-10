"use client";

import { Tabs } from "fumadocs-ui/components/tabs";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export const DOCS_TABS_CLASS = "vk-docs-tabs";

const START_EDGE = 16;
const END_EDGE = 48;

export function revealActiveTab(list: HTMLElement): void {
  const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
  if (active === null) return;
  const listBox = list.getBoundingClientRect();
  const tabBox = active.getBoundingClientRect();
  if (tabBox.left < listBox.left) {
    list.scrollLeft -= listBox.left - tabBox.left + START_EDGE;
  } else if (tabBox.right > listBox.right) {
    list.scrollLeft += tabBox.right - listBox.right + END_EDGE;
  }
}

export function DocsTabs({ className, ...props }: ComponentProps<typeof Tabs>): ReactNode {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = root.current?.querySelector<HTMLElement>(':scope > [role="tablist"]');
    if (list === null || list === undefined) return;
    revealActiveTab(list);
    const observer = new MutationObserver(() => revealActiveTab(list));
    observer.observe(list, { subtree: true, attributeFilter: ["data-state"] });
    return () => observer.disconnect();
  }, []);

  return <Tabs {...props} ref={root} className={cn(DOCS_TABS_CLASS, className)} />;
}

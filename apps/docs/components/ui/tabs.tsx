"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export type TabItem = { id: string; label: string };

export type TabListProps = {
  tabs: ReadonlyArray<TabItem>;
  active: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  tabClassName?: string;
  variant?: "underline" | "pill" | "segmented";
  idPrefix?: string;
};

const STEP_BY_KEY: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

export function tabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function tabPanelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

export function tabPanelProps(prefix: string, id: string, active: string) {
  const open = id === active;
  return {
    id: tabPanelId(prefix, id),
    role: "tabpanel",
    "aria-labelledby": tabId(prefix, id),
    "data-active": open,
    inert: !open,
  } as const;
}

const SEGMENTED_TAB_CLASS =
  "rounded-(--radius-segment) px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)";

function targetIndex(key: string, current: number, count: number): number | undefined {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = STEP_BY_KEY[key];
  if (step === undefined) return undefined;
  return (current + step + count) % count;
}

function focusSibling(
  event: KeyboardEvent<HTMLDivElement>,
  tabs: ReadonlyArray<TabItem>,
  active: string,
): string | undefined {
  const index = targetIndex(
    event.key,
    tabs.findIndex((tab) => tab.id === active),
    tabs.length,
  );
  if (index === undefined) return undefined;
  const next = tabs[index];
  if (!next) return undefined;
  event.preventDefault();
  const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons[index]?.focus();
  return next.id;
}

export function TabList({
  tabs,
  active,
  onSelect,
  ariaLabel,
  className,
  tabClassName,
  variant = "underline",
  idPrefix,
}: TabListProps): ReactNode {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = focusSibling(event, tabs, active);
    if (next !== undefined) onSelect(next);
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(variant === "segmented" && "vk-segmented", className)}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            {...(idPrefix
              ? { id: tabId(idPrefix, tab.id), "aria-controls": tabPanelId(idPrefix, tab.id) }
              : {})}
            onClick={() => onSelect(tab.id)}
            className={cn(
              variant === "segmented" && SEGMENTED_TAB_CLASS,
              tabClassName,
              selected ? "text-fd-foreground" : "text-fd-muted-foreground hover:text-fd-foreground",
              selected && variant !== "underline" && "bg-[color:var(--surface-card)]",
            )}
            style={
              selected && variant === "underline"
                ? { boxShadow: "inset 0 -2px 0 var(--v-glow)" }
                : undefined
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export type TabsProps = {
  tabs: ReadonlyArray<TabItem>;
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  children?: ReactNode;
};

const TAB_LIST_CLASS = "flex gap-4 border-b border-fd-border";
const TAB_CLASS = "pb-2 font-mono lowercase text-sm transition-colors";

export default function Tabs({
  tabs,
  value,
  defaultValue,
  onChange,
  children,
}: TabsProps): ReactNode {
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id ?? "");
  const active = value ?? internal;

  function select(id: string) {
    if (value === undefined) {
      setInternal(id);
    }
    onChange?.(id);
  }

  return (
    <div className="not-prose">
      <TabList
        tabs={tabs}
        active={active}
        onSelect={select}
        className={TAB_LIST_CLASS}
        tabClassName={TAB_CLASS}
      />
      {children}
    </div>
  );
}

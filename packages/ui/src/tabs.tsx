"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";
import { cn } from "./cn.ts";

export interface TabItem {
  readonly id: string;
  readonly label: string;
}

export interface TabListProps {
  readonly tabs: ReadonlyArray<TabItem>;
  readonly active: string;
  readonly onSelect: (id: string) => void;
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
  readonly className?: string;
  readonly tabClassName?: string;
}

const TAB_LIST_CLASS = "flex gap-4 border-b border-(--border-default)";
const TAB_CLASS = "vk-field pb-2 font-mono lowercase text-sm transition-colors";

const STEP_BY_KEY: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

function isRtl(element: HTMLElement): boolean {
  return element.closest("[dir]")?.getAttribute("dir") === "rtl";
}

function targetIndex(
  key: string,
  current: number,
  count: number,
  rtl: boolean,
): number | undefined {
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return count - 1;
  }
  const step = STEP_BY_KEY[key];
  if (step === undefined) {
    return undefined;
  }
  return (current + (rtl ? -step : step) + count) % count;
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
    isRtl(event.currentTarget),
  );
  const next = index === undefined ? undefined : tabs[index];
  if (index === undefined || next === undefined) {
    return undefined;
  }
  event.preventDefault();
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  return next.id;
}

export function TabList({
  tabs,
  active,
  onSelect,
  ariaLabel,
  ariaLabelledBy,
  className = TAB_LIST_CLASS,
  tabClassName = TAB_CLASS,
}: TabListProps): ReactNode {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const next = focusSibling(event, tabs, active);
    if (next !== undefined) {
      onSelect(next);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={className}
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
            onClick={() => onSelect(tab.id)}
            className={cn(
              tabClassName,
              selected ? "text-(--text-strong)" : "text-(--text-muted) hover:text-(--text-strong)",
            )}
            style={selected ? { boxShadow: "inset 0 -2px 0 var(--accent)" } : undefined}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabsProps {
  readonly tabs: ReadonlyArray<TabItem>;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (id: string) => void;
  readonly children?: ReactNode;
}

export function Tabs({ tabs, value, defaultValue, onChange, children }: TabsProps): ReactNode {
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id ?? "");
  const active = value ?? internal;

  function select(id: string): void {
    if (value === undefined) {
      setInternal(id);
    }
    onChange?.(id);
  }

  return (
    <div className="not-prose">
      <TabList tabs={tabs} active={active} onSelect={select} />
      {children}
    </div>
  );
}

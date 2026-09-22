"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export type TabItem = { id: string; label: string };

export type TabListProps = {
  tabs: ReadonlyArray<TabItem>;
  active: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  tabClassName?: string;
  variant?: "underline" | "pill";
};

export function TabList({
  tabs,
  active,
  onSelect,
  ariaLabel,
  className,
  tabClassName,
  variant = "underline",
}: TabListProps): ReactNode {
  return (
    <div role="tablist" aria-label={ariaLabel} className={className}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(tab.id)}
            className={cn(
              tabClassName,
              selected ? "text-fd-foreground" : "text-fd-muted-foreground hover:text-fd-foreground",
              selected && variant === "pill" && "bg-[color:var(--surface-card)]",
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

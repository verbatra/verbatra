import type { ReactNode } from "react";
import { cn } from "./cn.ts";

export interface SegmentedItem<Id extends string> {
  readonly id: Id;
  readonly label: string;
}

export interface SegmentedControlProps<Id extends string> {
  readonly items: readonly SegmentedItem<Id>[];
  readonly active: Id;
  readonly onChange: (id: Id) => void;
  readonly label: string;
}

const SEGMENT =
  "vk-field rounded-(--radius-sm) border border-transparent px-3 py-1 text-sm font-medium text-(--text-muted) hover:text-(--text-strong) focus-visible:outline-offset-1";

const SELECTED =
  "border-(--border-field) bg-(--surface-raised) font-semibold text-(--text-strong) shadow-(--shadow-sm)";

export function SegmentedControl<Id extends string>({
  items,
  active,
  onChange,
  label,
}: SegmentedControlProps<Id>): ReactNode {
  return (
    <fieldset
      className="m-0 inline-flex gap-1 rounded-(--radius-md) border border-(--border-default) bg-(--surface-card) p-1"
      aria-label={label}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={cn(SEGMENT, item.id === active && SELECTED)}
          aria-pressed={item.id === active}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </fieldset>
  );
}

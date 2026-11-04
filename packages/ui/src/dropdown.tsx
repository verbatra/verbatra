"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button, type ButtonVariant } from "./button.tsx";
import { Icon } from "./icon.tsx";
import { Popover } from "./popover.tsx";

export interface DropdownItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}

export interface DropdownProps {
  readonly label: ReactNode;
  readonly ariaLabel?: string;
  readonly items: readonly DropdownItem[];
  readonly variant?: ButtonVariant;
  readonly align?: "start" | "end";
}

const ITEM =
  "vk-field flex w-full items-center gap-2 rounded-(--radius-md) px-3 py-2 text-start text-sm text-(--text-strong) hover:not-disabled:bg-(--surface-hover) focus-visible:-outline-offset-2 disabled:cursor-default disabled:opacity-60";

function enabledItems(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
}

function targetIndex(key: string, current: number, count: number): number | undefined {
  if (key === "ArrowDown") {
    return (current + 1) % count;
  }
  if (key === "ArrowUp") {
    return (current - 1 + count) % count;
  }
  if (key === "Home") {
    return 0;
  }
  return key === "End" ? count - 1 : undefined;
}

function Menu({
  items,
  onSelect,
  onTab,
}: {
  readonly items: readonly DropdownItem[];
  readonly onSelect: (item: DropdownItem) => void;
  readonly onTab: () => void;
}): ReactNode {
  const menuRef = useRef<HTMLDivElement>(null);
  const hasSelection = items.some((item) => item.selected === true);

  useEffect(() => {
    const available = enabledItems(menuRef.current as HTMLDivElement);
    const selected = available.find((button) => button.dataset.selected === "true");
    (selected ?? available[0])?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Tab") {
      onTab();
      return;
    }
    const available = enabledItems(event.currentTarget);
    const index = targetIndex(
      event.key,
      available.indexOf(document.activeElement as HTMLButtonElement),
      available.length,
    );
    if (index === undefined) {
      return;
    }
    event.preventDefault();
    available[index]?.focus();
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys bubble from the menu items inside this wrapper
    <div role="presentation" className="flex flex-col" ref={menuRef} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role={hasSelection ? "menuitemradio" : "menuitem"}
          {...(hasSelection ? { "aria-checked": item.selected === true } : {})}
          data-selected={item.selected === true ? "true" : undefined}
          disabled={item.disabled}
          tabIndex={-1}
          className={ITEM}
          onClick={() => onSelect(item)}
        >
          {hasSelection ? (
            <span className="w-4 flex-none text-(--accent)">
              {item.selected === true ? <Icon name="check" size={14} /> : null}
            </span>
          ) : null}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Dropdown({
  label,
  ariaLabel,
  items,
  variant = "secondary",
  align = "start",
}: DropdownProps): ReactNode {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close(): void {
    triggerRef.current?.focus();
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onClose={close}
      align={align}
      role="menu"
      ariaLabel={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      anchor={
        <Button
          ref={triggerRef}
          variant={variant}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && !open) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          {label}
          <Icon name="chevron-down" size={12} className="text-(--text-muted)" />
        </Button>
      }
    >
      <Menu
        items={items}
        onTab={close}
        onSelect={(item) => {
          item.onSelect();
          close();
        }}
      />
    </Popover>
  );
}

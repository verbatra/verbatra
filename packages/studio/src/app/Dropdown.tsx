import { Button, type ButtonVariant, Icon } from "@verbatra/ui";
import { type ReactNode, useState } from "react";
import { Popover } from "./Popover.js";

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

export function Dropdown({
  label,
  ariaLabel,
  items,
  variant = "secondary",
  align = "start",
}: DropdownProps): ReactNode {
  const [open, setOpen] = useState(false);
  const hasSelection = items.some((item) => item.selected === true);

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align={align}
      ariaLabel={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      anchor={
        <Button
          variant={variant}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={() => setOpen((current) => !current)}
        >
          {label}
          <Icon name="chevron-down" size={12} className="text-muted-foreground" />
        </Button>
      }
    >
      <div className="m-0 flex flex-col p-0">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            aria-current={item.selected === true || undefined}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-foreground hover:not-disabled:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-60"
            onClick={() => {
              item.onSelect();
              setOpen(false);
            }}
          >
            {hasSelection ? (
              <span className="w-4 flex-none text-primary">
                {item.selected === true ? <Icon name="check" size={14} /> : null}
              </span>
            ) : null}
            {item.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}

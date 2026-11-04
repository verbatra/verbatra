"use client";

import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { cn } from "./cn.ts";

export type TooltipSide = "end" | "bottom" | "bottom-end";

export interface TooltipProps {
  readonly label: string;
  readonly side?: TooltipSide;
  readonly decorative?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

interface DescribableProps {
  readonly disabled?: boolean;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
}

const SLOT =
  "pointer-events-none invisible absolute z-40 opacity-0 motion-safe:transition-opacity motion-safe:delay-150 data-[open]:pointer-events-auto data-[open]:visible data-[open]:opacity-100";

const POSITION: Readonly<Record<TooltipSide, string>> = {
  end: "start-full top-1/2 ps-2 -translate-y-1/2",
  bottom: "left-1/2 top-full pt-2 -translate-x-1/2",
  "bottom-end": "end-0 top-full pt-2",
};

const BUBBLE =
  "block whitespace-nowrap rounded-(--radius-md) border border-(--border-default) bg-(--surface-raised) px-2 py-1 text-xs text-(--text-strong) shadow-(--shadow-panel)";

function joinIds(existing: string | undefined, id: string): string {
  return existing === undefined || existing === "" ? id : `${existing} ${id}`;
}

export function Tooltip({
  label,
  side = "end",
  decorative = false,
  className,
  children,
}: TooltipProps): ReactNode {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const control = isValidElement<DescribableProps>(children) ? children : null;
  const disabled = control?.props.disabled === true;
  const visible = !disabled && (hovered || focused) && !dismissed;
  const duplicatesName = decorative || control?.props["aria-label"] === label;

  useEffect(() => {
    if (!visible) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setDismissed(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  function show(set: (value: boolean) => void): void {
    set(true);
    setDismissed(false);
  }

  const described =
    control === null || disabled || duplicatesName
      ? children
      : cloneElement(control as ReactElement<DescribableProps>, {
          "aria-describedby": joinIds(control.props["aria-describedby"], id),
        });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only observes pointer and focus events bubbling from the control it describes
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => show(setHovered)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => show(setFocused)}
      onBlur={() => setFocused(false)}
    >
      {described}
      {disabled ? null : (
        <span
          data-slot=""
          data-side={side}
          hidden={visible ? undefined : true}
          data-open={visible ? "" : undefined}
          className={cn(SLOT, POSITION[side])}
        >
          <span
            id={id}
            role="tooltip"
            aria-hidden={duplicatesName ? true : undefined}
            className={BUBBLE}
          >
            {label}
          </span>
        </span>
      )}
    </span>
  );
}

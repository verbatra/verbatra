"use client";

import {
  cloneElement,
  type FocusEvent,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "./cn.ts";
import { useBubblePlacement } from "./tooltip-fit.ts";

export type TooltipTrigger = "hover-and-focus" | "focus";

export type TooltipSide = "end" | "bottom" | "bottom-start" | "bottom-end" | "top" | "top-start";

export interface TooltipProps {
  readonly label: string;
  readonly side?: TooltipSide;
  readonly decorative?: boolean;
  readonly trigger?: TooltipTrigger;
  readonly flip?: boolean;
  readonly wide?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

interface DescribableProps {
  readonly disabled?: boolean;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
}

const SLOT =
  "pointer-events-none invisible absolute z-40 size-0 overflow-hidden opacity-0 motion-safe:transition-opacity motion-safe:delay-150 data-[open]:pointer-events-auto data-[open]:visible data-[open]:size-auto data-[open]:overflow-visible data-[open]:opacity-100";

const POSITION: Readonly<Record<TooltipSide, string>> = {
  end: "start-[calc(100%+var(--tooltip-x,0px))] top-1/2 ps-2 -translate-y-1/2",
  bottom: "left-[calc(50%+var(--tooltip-x,0px))] top-full pt-2 -translate-x-1/2",
  "bottom-start": "start-[var(--tooltip-x,0px)] top-full pt-2",
  "bottom-end": "end-[var(--tooltip-x,0px)] top-full pt-2",
  top: "left-[calc(50%+var(--tooltip-x,0px))] bottom-full pb-2 -translate-x-1/2",
  "top-start": "start-[var(--tooltip-x,0px)] bottom-full pb-2",
};

function isKeyboardFocus(wrapper: HTMLElement): boolean {
  try {
    return wrapper.querySelector(":focus-visible") !== null;
  } catch {
    return true;
  }
}

const BUBBLE =
  "block whitespace-nowrap font-sans font-normal rounded-(--radius-md) border border-(--border-default) bg-(--surface-raised) px-2 py-1 text-xs text-(--text-strong) shadow-(--shadow-panel)";

const WIDE_BUBBLE = "w-max max-w-[min(28rem,calc(100vw-2rem))] whitespace-normal break-words";

function bubbleClassName(wide: boolean | undefined): string {
  return wide === true ? cn(BUBBLE, WIDE_BUBBLE) : BUBBLE;
}

function dataFlag(on: boolean | undefined): "" | undefined {
  return on === true ? "" : undefined;
}

function joinIds(existing: string | undefined, id: string): string {
  return existing === undefined || existing === "" ? id : `${existing} ${id}`;
}

function hasNoBubble(label: string, control: ReactElement<DescribableProps> | null): boolean {
  return label === "" || control?.props.disabled === true;
}

export function Tooltip({
  label,
  side = "end",
  decorative = false,
  trigger = "hover-and-focus",
  flip = false,
  wide,
  className,
  children,
}: TooltipProps): ReactNode {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const control = isValidElement<DescribableProps>(children) ? children : null;
  const disabled = hasNoBubble(label, control);
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

  const { placement, remeasure } = useBubblePlacement({
    side,
    flip,
    wide,
    visible,
    label,
    wrapperRef,
    slotRef,
    bubbleRef,
  });

  function show(set: (value: boolean) => void, wrapper: HTMLElement): void {
    remeasure(wrapper);
    set(true);
    setDismissed(false);
  }

  function showFromFocus(event: FocusEvent<HTMLSpanElement>): void {
    if (trigger === "focus" && !isKeyboardFocus(event.currentTarget)) {
      return;
    }
    show(setFocused, event.currentTarget);
  }

  const pointer =
    trigger === "focus"
      ? {}
      : {
          onMouseEnter: (event: MouseEvent<HTMLSpanElement>) =>
            show(setHovered, event.currentTarget),
          onMouseLeave: () => setHovered(false),
        };

  const described =
    control === null || disabled || duplicatesName
      ? children
      : cloneElement(control as ReactElement<DescribableProps>, {
          "aria-describedby": joinIds(control.props["aria-describedby"], id),
        });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only observes pointer and focus events bubbling from the control it describes
    <span
      ref={wrapperRef}
      className={cn("relative inline-flex", className)}
      {...pointer}
      onFocus={showFromFocus}
      onBlur={() => setFocused(false)}
    >
      {described}
      {disabled ? null : (
        <span
          ref={slotRef}
          data-slot=""
          data-side={placement}
          data-wide={dataFlag(wide)}
          data-open={visible ? "" : undefined}
          className={cn(SLOT, POSITION[placement])}
        >
          <span
            id={id}
            ref={bubbleRef}
            role="tooltip"
            aria-hidden={duplicatesName ? true : undefined}
            className={bubbleClassName(wide)}
          >
            {label}
          </span>
        </span>
      )}
    </span>
  );
}

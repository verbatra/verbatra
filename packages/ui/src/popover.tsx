"use client";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "./cn.ts";
import { focusableElements } from "./focusable.ts";
import { type Placement, placePopover } from "./popover-position.ts";

export type PopoverRole = "dialog" | "menu";

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchor: ReactNode;
  readonly children: ReactNode;
  readonly align?: "start" | "end";
  readonly role?: PopoverRole;
  readonly ariaLabel?: string | undefined;
}

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;
const INITIAL: Placement = { shiftX: 0, side: "bottom", maxHeight: Number.POSITIVE_INFINITY };

function measurePlacement(container: HTMLElement, panel: HTMLElement, appliedShift: number) {
  const anchor = container.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  return placePopover({
    anchorTop: anchor.top,
    anchorBottom: anchor.bottom,
    panelLeft: box.left - appliedShift,
    panelWidth: box.width,
    panelHeight: panel.scrollHeight + (panel.offsetHeight - panel.clientHeight),
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: window.innerHeight,
    margin: VIEWPORT_MARGIN,
    gap: ANCHOR_GAP,
  });
}

function useRestingPlacement(
  open: boolean,
  containerRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
): Placement {
  const [placement, setPlacement] = useState<Placement>(INITIAL);
  const appliedShift = useRef(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!open || container === null || panel === null) {
      appliedShift.current = 0;
      setPlacement(INITIAL);
      return;
    }
    function measure(): void {
      const next = measurePlacement(
        container as HTMLElement,
        panel as HTMLElement,
        appliedShift.current,
      );
      appliedShift.current = next.shiftX;
      setPlacement((current) =>
        current.shiftX === next.shiftX &&
        current.side === next.side &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, containerRef, panelRef]);

  return placement;
}

function returnFocusToAnchor(container: HTMLElement, panel: HTMLElement | null): void {
  const active = document.activeElement;
  if (active !== document.body && !(active !== null && container.contains(active))) {
    return;
  }
  focusableElements(container)
    .find((element) => panel === null || !panel.contains(element))
    ?.focus();
}

export function Popover({
  open,
  onClose,
  anchor,
  children,
  align = "start",
  role = "dialog",
  ariaLabel,
}: PopoverProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const placement = useRestingPlacement(open, containerRef, panelRef);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && containerRef.current !== null) {
        const container = containerRef.current;
        const panel = panelRef.current;
        onClose();
        returnFocusToAnchor(container, panel);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      {anchor}
      {open ? (
        <div
          ref={panelRef}
          data-popover=""
          data-side={placement.side}
          className={cn(
            "absolute z-30 min-w-[180px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-(--radius-lg) border border-(--border-default) bg-(--surface-raised) p-2 shadow-(--shadow-panel)",
            placement.side === "top" ? "bottom-full mb-1" : "top-full mt-1",
            align === "end" ? "end-0" : "start-0",
          )}
          style={{
            transform: placement.shiftX === 0 ? undefined : `translateX(${placement.shiftX}px)`,
            maxHeight: Number.isFinite(placement.maxHeight) ? placement.maxHeight : undefined,
          }}
          {...(role === "dialog"
            ? { role: "dialog", "aria-modal": false, "aria-label": ariaLabel }
            : { role: "menu", "aria-label": ariaLabel })}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

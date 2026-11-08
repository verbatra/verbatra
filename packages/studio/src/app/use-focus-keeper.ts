import { type RefObject, useLayoutEffect, useRef } from "react";

export interface FocusKeeperAdapter {
  readonly items: (root: HTMLElement) => readonly string[];
  readonly itemOf: (active: HTMLElement) => string | undefined;
  readonly find: (root: HTMLElement, item: string) => HTMLElement | undefined;
  readonly fallback: (root: HTMLElement) => void;
}

interface HeldFocus {
  readonly element: HTMLElement;
  readonly item: string;
}

export function nearestKept(
  order: readonly string[],
  lost: string,
  kept: readonly string[],
): string | undefined {
  const at = order.indexOf(lost);
  const after = order.slice(at + 1).find((item) => kept.includes(item));
  return (
    after ??
    order
      .slice(0, Math.max(at, 0))
      .reverse()
      .find((item) => kept.includes(item))
  );
}

function heldFocus(root: HTMLElement | null, adapter: FocusKeeperAdapter): HeldFocus | null {
  const active = document.activeElement;
  if (root === null || !(active instanceof HTMLElement) || !root.contains(active)) {
    return null;
  }
  const item = adapter.itemOf(active);
  return item === undefined ? null : { element: active, item };
}

function isStranded(lost: HeldFocus | null): lost is HeldFocus {
  return lost !== null && !lost.element.isConnected && document.activeElement === document.body;
}

function handOver(
  root: HTMLElement,
  lost: HeldFocus,
  order: readonly string[],
  kept: readonly string[],
  adapter: FocusKeeperAdapter,
): void {
  const next = kept.includes(lost.item) ? lost.item : nearestKept(order, lost.item, kept);
  const target = next === undefined ? undefined : adapter.find(root, next);
  if (target === undefined) {
    adapter.fallback(root);
  } else {
    target.focus({ preventScroll: true });
  }
}

export function useFocusKeeper(
  rootRef: RefObject<HTMLElement | null>,
  adapter: FocusKeeperAdapter,
): void {
  const order = useRef<string[]>([]);
  const held = useRef<HeldFocus | null>(null);
  held.current = heldFocus(rootRef.current, adapter);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const kept = [...adapter.items(root)];
    if (isStranded(held.current)) {
      handOver(root, held.current, order.current, kept, adapter);
    }
    order.current = kept;
  });
}

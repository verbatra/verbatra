import { type RefObject, useEffect } from "react";
import type { DrawerState } from "@/components/use-drawer-escape";

export const DRAWER_ID = "nd-sidebar-mobile";
export const PAGE_ID = "nd-page";

const FOCUS_ATTEMPTS = 30;
const ATTACH_ATTEMPTS = 30;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const LIVE_HOST = "next-route-announcer, [aria-live], [role='status'], [role='alert']";

function ancestorsOf(elements: ReadonlyArray<Element>): Set<Element> {
  const chain = new Set<Element>();
  for (const element of elements) {
    for (let node: Element | null = element; node; node = node.parentElement) chain.add(node);
  }
  return chain;
}

function shouldInert(sibling: Element, chain: ReadonlySet<Element>): boolean {
  if (chain.has(sibling) || sibling.hasAttribute("inert")) return false;
  return !sibling.matches(LIVE_HOST);
}

export function inertOutside(keep: ReadonlyArray<Element>): () => void {
  const chain = ancestorsOf(keep);
  const changed: Element[] = [];
  for (const node of chain) {
    if (keep.includes(node) || node === document.documentElement) continue;
    for (const sibling of Array.from(node.children)) {
      if (!shouldInert(sibling, chain)) continue;
      sibling.setAttribute("inert", "");
      changed.push(sibling);
    }
  }
  return () => {
    for (const element of changed) element.removeAttribute("inert");
  };
}

function focusables(trigger: HTMLElement, drawer: HTMLElement): HTMLElement[] {
  return [trigger, ...Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE))];
}

function wrapTab(event: KeyboardEvent, trigger: HTMLElement, drawer: HTMLElement): void {
  if (event.key !== "Tab") return;
  const items = focusables(trigger, drawer);
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function returnFocus(trigger: HTMLElement, drawer: HTMLElement, openedAt: string): void {
  const active = document.activeElement;
  if (active !== document.body && !drawer.contains(active)) return;
  const page = window.location.pathname === openedAt ? null : document.getElementById(PAGE_ID);
  (page ?? trigger).focus({ preventScroll: page !== null });
}

function engage(trigger: HTMLElement, drawer: HTMLElement): () => void {
  const overlay = drawer.previousElementSibling;
  const keepOverlay = overlay && overlay.childElementCount === 0 ? [overlay] : [];
  const restore = inertOutside([trigger, drawer, ...keepOverlay]);
  const openedAt = window.location.pathname;
  const onKeyDown = (event: KeyboardEvent): void => wrapTab(event, trigger, drawer);
  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    restore();
    returnFocus(trigger, drawer, openedAt);
  };
}

export function useDrawerContainment(
  { open, mode }: Pick<DrawerState, "open" | "mode">,
  triggerRef: RefObject<HTMLButtonElement | null>,
): void {
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || mode !== "drawer" || !trigger) return;
    let release: (() => void) | undefined;
    let frame = 0;
    let focusAttempts = 0;
    let attachAttempts = 0;
    const focusInto = (drawer: HTMLElement): void => {
      const first = drawer.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
      focusAttempts += 1;
      if (first && document.activeElement !== first && focusAttempts < FOCUS_ATTEMPTS) {
        frame = requestAnimationFrame(() => focusInto(drawer));
      }
    };
    const attach = (): void => {
      const drawer = document.getElementById(DRAWER_ID);
      if (!drawer) {
        attachAttempts += 1;
        if (attachAttempts < ATTACH_ATTEMPTS) frame = requestAnimationFrame(attach);
        return;
      }
      release = engage(trigger, drawer);
      focusInto(drawer);
    };
    attach();
    return () => {
      cancelAnimationFrame(frame);
      release?.();
    };
  }, [open, mode, triggerRef]);
}

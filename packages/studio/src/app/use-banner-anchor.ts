import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

interface Anchor {
  readonly element: HTMLElement;
  readonly top: number;
}

const ANCHORS = "[data-revision], [data-working-tree]";

function firstVisible(scroller: HTMLElement): Anchor | null {
  const floor = scroller
    .querySelector<HTMLElement>("[data-sticky]")
    ?.getBoundingClientRect().bottom;
  const limit = floor ?? scroller.getBoundingClientRect().top;
  for (const element of scroller.querySelectorAll<HTMLElement>(ANCHORS)) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom > limit) {
      return { element, top: rect.top };
    }
  }
  return null;
}

export function useBannerAnchor(
  scrollerRef: RefObject<HTMLElement | null>,
  bannerShown: boolean,
): void {
  const shown = useRef<boolean | null>(null);
  const anchor = useRef<Anchor | null>(null);

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (node !== null) {
      node.style.overflowAnchor = "none";
      const held = anchor.current;
      if (shown.current !== null && shown.current !== bannerShown && held?.element.isConnected) {
        node.scrollTop += held.element.getBoundingClientRect().top - held.top;
      }
      anchor.current = firstVisible(node);
    }
    shown.current = bannerShown;
  });

  useEffect(() => {
    const node = scrollerRef.current;
    const remember = (): void => {
      anchor.current = node === null ? null : firstVisible(node);
    };
    node?.addEventListener("scroll", remember, { passive: true });
    return () => node?.removeEventListener("scroll", remember);
  }, [scrollerRef]);
}

export function useRevealEdit(
  localesRef: RefObject<HTMLElement | null>,
  active: boolean,
  locale: string | null,
): void {
  useEffect(() => {
    if (!active || locale === null) {
      return;
    }
    const block = localesRef.current?.querySelector<HTMLElement>(
      `[data-locale="${CSS.escape(locale)}"]`,
    );
    if (block === null || block === undefined) {
      return;
    }
    const sticky = block
      .closest("[data-editor-pane], [role='dialog']")
      ?.querySelector<HTMLElement>("[data-sticky]");
    block.style.scrollMarginTop = `${(sticky?.offsetHeight ?? 0) + 8}px`;
    block.scrollIntoView?.({ block: "nearest" });
  }, [localesRef, active, locale]);
}

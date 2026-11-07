import { type RefObject, useLayoutEffect, useRef } from "react";

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
  const scroller = scrollerRef.current;

  if (scroller !== null && shown.current !== null && shown.current !== bannerShown) {
    anchor.current = firstVisible(scroller);
  }

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    shown.current = bannerShown;
    const held = anchor.current;
    anchor.current = null;
    if (node !== null) {
      node.style.overflowAnchor = "none";
      if (held?.element.isConnected === true) {
        node.scrollTop += held.element.getBoundingClientRect().top - held.top;
      }
    }
  }, [bannerShown, scrollerRef]);
}

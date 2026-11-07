import { type RefObject, useLayoutEffect, useRef } from "react";

export function useBannerAnchor(
  scrollerRef: RefObject<HTMLElement | null>,
  bannerShown: boolean,
): void {
  const height = useRef<number | null>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller !== null && scroller !== undefined) {
      scroller.style.overflowAnchor = "none";
    }
    const sticky = scroller?.querySelector<HTMLElement>("[data-sticky]");
    const next = sticky?.offsetHeight ?? 0;
    const previous = height.current;
    height.current = next;
    if (scroller !== null && scroller !== undefined && previous !== null && next !== previous) {
      scroller.scrollTop += next - previous;
    }
  }, [bannerShown, scrollerRef]);
}

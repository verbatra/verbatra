import { type RefObject, useEffect } from "react";

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

"use client";

import type { ReactNode, RefObject } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap-draw";

export const FLOW_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

export const FLOW_DRAW_START = "top 80%";

export const FLOW_DRAW_END = "bottom 60%";

export const FLOW_DRAWING = "drawing";

function markOffsets(rail: Element, marks: ReadonlyArray<HTMLElement>): ReadonlyArray<number> {
  const box = rail.getBoundingClientRect();
  return marks.map((mark) => {
    if (box.height <= 0) return 0;
    const own = mark.getBoundingClientRect();
    return Math.min(1, Math.max(0, (own.top + own.height / 2 - box.top) / box.height));
  });
}

export function FlowDraw({ scope }: { scope: RefObject<HTMLElement | null> }): ReactNode {
  useGSAP(
    () => {
      const root = scope.current;
      const rail = root?.querySelector(".vk-flow-rail");
      const path = root?.querySelector<SVGPathElement>(".vk-flow-path");
      const list = root?.querySelector<HTMLElement>(".vk-flow-list");
      if (!root || !rail || !path || !list) return;
      const marks = [...root.querySelectorAll<HTMLElement>(".vk-flow-mark")];
      const mm = gsap.matchMedia();
      mm.add(FLOW_MOTION_QUERY, () => {
        let offsets: ReadonlyArray<number> = [];
        const reveal = (progress: number) => {
          marks.forEach((mark, index) => {
            mark.toggleAttribute("data-revealed", (offsets[index] ?? 0) <= progress);
          });
        };
        root.dataset.flow = FLOW_DRAWING;
        gsap.fromTo(
          path,
          { drawSVG: "0%" },
          {
            drawSVG: "100%",
            ease: "none",
            scrollTrigger: {
              trigger: list,
              start: FLOW_DRAW_START,
              end: FLOW_DRAW_END,
              scrub: true,
              invalidateOnRefresh: true,
              onRefresh: (self) => {
                offsets = markOffsets(rail, marks);
                reveal(self.progress);
              },
              onUpdate: (self) => reveal(self.progress),
            },
          },
        );
        document.fonts?.ready.then(() => ScrollTrigger.refresh());
        return () => {
          delete root.dataset.flow;
          for (const mark of marks) mark.removeAttribute("data-revealed");
        };
      });
      return () => mm.revert();
    },
    { scope },
  );
  return null;
}

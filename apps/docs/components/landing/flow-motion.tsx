"use client";

import {
  type ComponentType,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { afterFirstContentfulPaint } from "@/lib/first-paint";
import { prefersReducedMotion } from "@/lib/reduced-motion";

type FlowDrawComponent = ComponentType<{ scope: RefObject<HTMLElement | null> }>;

export const FLOW_LOAD_MARGIN = "0px 0px 100% 0px";

let drawLoad: Promise<FlowDrawComponent> | undefined;

export function loadFlowDraw(): Promise<FlowDrawComponent> {
  drawLoad ??= import("./flow-draw").then(
    (module) => module.FlowDraw,
    (error: unknown) => {
      drawLoad = undefined;
      throw error;
    },
  );
  return drawLoad;
}

export function FlowMotion({ children }: { children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const [Draw, setDraw] = useState<FlowDrawComponent | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;
    let active = true;
    let observer: IntersectionObserver | undefined;
    afterFirstContentfulPaint().then(() => {
      if (!active) return;
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          loadFlowDraw().then(
            (component) => {
              if (active) setDraw(() => component);
            },
            () => undefined,
          );
        },
        { rootMargin: FLOW_LOAD_MARGIN },
      );
      observer.observe(node);
    });
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="vk-flow">
      {children}
      {Draw ? <Draw scope={ref} /> : null}
    </div>
  );
}

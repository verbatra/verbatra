import { animate } from "motion/mini";
import { prefersReducedMotion } from "@/lib/reduced-motion";

const PANEL_FADE = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;

export function fadeInPanel(element: HTMLElement): void {
  if (typeof element.animate !== "function" || prefersReducedMotion()) return;
  animate(element, { opacity: [0, 1], transform: ["translateY(4px)", "none"] }, PANEL_FADE);
}

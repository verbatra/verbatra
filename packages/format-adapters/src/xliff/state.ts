import type { Element } from "@xmldom/xmldom";
import type { XliffVersion } from "./document.js";

const UNTRANSLATED_TARGET_STATES = new Set(["new", "needs-translation"]);

export function isUntranslatedTarget(target: Element): boolean {
  return UNTRANSLATED_TARGET_STATES.has(target.getAttribute("state") ?? "");
}

export function isInitialSegment(container: Element, version: XliffVersion): boolean {
  return version === "2.0" && container.getAttribute("state") === "initial";
}

export function markTranslated(target: Element, container: Element, version: XliffVersion): void {
  if (isUntranslatedTarget(target)) {
    target.setAttribute("state", "translated");
  }
  if (isInitialSegment(container, version)) {
    container.setAttribute("state", "translated");
    container.removeAttribute("subState");
  }
}

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  AiTranslationSkeleton,
  AutomationSkeleton,
  ExcelHandoffSkeleton,
} from "./pillar-skeletons";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubBrowserApis(reducedMotion: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reducedMotion && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
}

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(node: React.ReactNode, reducedMotion: boolean): HTMLDivElement {
  stubBrowserApis(reducedMotion);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  if (!mounted) return;
  const { container, root } = mounted;
  mounted = undefined;
  act(() => {
    root.unmount();
  });
  container.remove();
});

function transparentElements(container: HTMLDivElement): ReadonlyArray<string> {
  return [...container.querySelectorAll<HTMLElement | SVGElement>("*")]
    .filter((element) => {
      const inline = element.style.opacity;
      const attribute = element.getAttribute("opacity");
      return inline === "0" || attribute === "0";
    })
    .map((element) => `${element.tagName}:${element.textContent?.slice(0, 24) ?? ""}`);
}

const SKELETONS = [
  ["AiTranslationSkeleton", <AiTranslationSkeleton key="ai" />],
  ["ExcelHandoffSkeleton", <ExcelHandoffSkeleton key="excel" />],
  ["AutomationSkeleton", <AutomationSkeleton key="automation" />],
] as const;

describe("pillar skeletons under reduced motion", () => {
  for (const [name, node] of SKELETONS) {
    it(`${name} leaves nothing at opacity 0`, () => {
      const container = render(node, true);

      expect(transparentElements(container)).toEqual([]);
    });
  }

  it("keeps every translated target row readable", () => {
    const container = render(<AiTranslationSkeleton />, true);

    for (const code of ["de", "es", "fr"]) {
      expect(container.textContent).toContain(code);
    }
  });

  it("keeps every pipeline node readable", () => {
    const container = render(<AutomationSkeleton />, true);

    for (const node of ["commit", "check", "translate"]) {
      expect(container.textContent).toContain(node);
    }
  });
});

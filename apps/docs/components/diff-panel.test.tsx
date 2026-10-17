// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Locale } from "@/lib/i18n";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import { DiffPanel } from "./diff-panel";

const MESSAGES = { en, de, es, fr } as const;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubBrowserApis(reducedMotion: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: reducedMotion, media: query }),
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: class {
      observe(): void {}
      disconnect(): void {}
    },
  });
}

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(reducedMotion: boolean, locale: Locale = "en"): HTMLDivElement {
  stubBrowserApis(reducedMotion);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        <DiffPanel />
      </NextIntlClientProvider>,
    );
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

function changedCellText(container: HTMLDivElement): string {
  const cells = [...container.querySelectorAll(".grid > div")].filter((cell) =>
    cell.textContent?.includes("cart.checkout"),
  );
  const target = cells.at(-1);
  if (!target) throw new Error("no target cell rendered for the changed row");
  return target.textContent ?? "";
}

describe("DiffPanel", () => {
  it("renders the changed value empty until the panel scrolls into view", () => {
    const container = render(false);

    expect(changedCellText(container)).toContain('""');
    expect(changedCellText(container)).not.toContain("Zur Kasse");
  });

  it("shows the full changed value immediately when motion is reduced", () => {
    const container = render(true);

    expect(changedCellText(container)).toContain('"Zur Kasse"');
  });

  it.each(Object.keys(MESSAGES) as Locale[])(
    "labels and captions the panel in the %s page locale",
    (locale) => {
      const container = render(true, locale);
      const figure = container.querySelector("figure");

      expect(figure?.getAttribute("aria-label")).toBe(MESSAGES[locale].docs.diffPanel.label);
      expect(figure?.querySelector("figcaption")?.textContent).toBe(
        MESSAGES[locale].docs.diffPanel.caption,
      );
    },
  );
});

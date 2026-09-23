// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const intl = vi.hoisted(() => ({ locale: "en" }));
const TAG_BY_ITEM: Record<string, string> = { privacy: "dataHandling" };

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      rich: (key: string, tags: Record<string, (chunks: ReactNode) => ReactNode>) => {
        const itemId = key.split(".")[1] ?? "";
        const tag = tags[TAG_BY_ITEM[itemId] ?? itemId];
        return tag ? tag("link text") : key;
      },
    }),
  useLocale: () => intl.locale,
}));

const { Faq } = await import("./faq");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  { id: "languages", question: "Which languages?", answer: "Any." },
  { id: "releases", question: "Where are the releases?", answer: "On GitHub." },
  { id: "privacy", question: "Does it send my strings?", answer: "Only to the provider." },
];

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(locale: string): HTMLDivElement {
  intl.locale = locale;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Faq items={ITEMS} />);
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

function answerLink(container: HTMLDivElement, index: number): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>(`#faq-panel-${index} a`);
}

describe("the landing faq answer links", () => {
  it("links the language support page without a prefix in the default locale", () => {
    expect(answerLink(render("en"), 0)?.getAttribute("href")).toBe("/docs/language-support");
  });

  it("links the language support page in the reader's locale", () => {
    expect(answerLink(render("de"), 0)?.getAttribute("href")).toBe("/de/docs/language-support");
  });

  it("falls back to the default locale's page for a locale the site does not serve", () => {
    expect(answerLink(render("it"), 0)?.getAttribute("href")).toBe("/docs/language-support");
  });

  it("links the data handling page without a prefix in the default locale", () => {
    expect(answerLink(render("en"), 2)?.getAttribute("href")).toBe("/docs/data-handling");
  });

  it("links the data handling page in the reader's locale", () => {
    expect(answerLink(render("fr"), 2)?.getAttribute("href")).toBe("/fr/docs/data-handling");
  });

  it("opens the release notes in a new tab", () => {
    const link = answerLink(render("en"), 1);

    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("href")).toContain("/releases");
  });
});

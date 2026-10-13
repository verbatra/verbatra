// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preloadRegisteredIslands } from "@/test-support/islands";
import { LICENSE_URL } from "./links";

const intl = vi.hoisted(() => ({ locale: "en" }));
const TAG_BY_ITEM: Record<string, string> = { privacy: "dataHandling", cost: "license" };

vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign((key: string) => key, {
      rich: (key: string, tags: Record<string, (chunks: ReactNode) => ReactNode>) => {
        const itemId = key.split(".")[1] ?? "";
        const tag = tags[TAG_BY_ITEM[itemId] ?? itemId];
        return tag ? tag("link text") : key;
      },
    }),
  getLocale: async () => intl.locale,
}));

const { Faq } = await import("./faq");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  { id: "privacy", question: "Does it send my strings?" },
  { id: "cost", question: "What does it cost?" },
];

await preloadRegisteredIslands();

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function render(locale: string): Promise<HTMLDivElement> {
  intl.locale = locale;
  const element = await Faq({ items: ITEMS });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
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

function answerLink(container: HTMLDivElement, id: string): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>(`[data-faq="${id}"] [role="region"] a`);
}

describe("the landing faq answer links", () => {
  it("links the data handling page without a prefix in the default locale", async () => {
    expect(answerLink(await render("en"), "privacy")?.getAttribute("href")).toBe(
      "/docs/data-handling",
    );
  });

  it("links the data handling page in the reader's locale", async () => {
    expect(answerLink(await render("fr"), "privacy")?.getAttribute("href")).toBe(
      "/fr/docs/data-handling",
    );
  });

  it("falls back to the default locale's page for a locale the site does not serve", async () => {
    expect(answerLink(await render("it"), "privacy")?.getAttribute("href")).toBe(
      "/docs/data-handling",
    );
  });

  it("opens the licence in a new tab", async () => {
    const link = answerLink(await render("en"), "cost");
    expect(link?.getAttribute("href")).toBe(LICENSE_URL);
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it.each(["en", "de", "es", "fr"])(
    "uses in %s only the tags the component renders, so no answer prints a raw tag",
    async (locale) => {
      const { default: messages } = await import(`@/messages/${locale}.json`);
      const answers = Object.values(
        (messages as { landing: { faq: { items: Record<string, { answer: string }> } } }).landing
          .faq.items,
      ).map((item) => item.answer);
      const tags = new Set(
        answers.flatMap((answer) => [...answer.matchAll(/<(\w+)>/g)].map((m) => m[1])),
      );
      expect([...tags].toSorted()).toEqual(["dataHandling", "license"]);
    },
  );
});

// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../global.css", () => ({}));

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Inter: font, JetBrains_Mono: font, Space_Grotesk: font };
});

vi.mock("next/script", () => ({
  default: ({
    strategy: _strategy,
    ...props
  }: ComponentProps<"script"> & { strategy?: string }) => <script {...props} />,
}));

vi.mock("next-intl/server", () => ({
  getMessages: async () => ({}),
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => {},
}));

vi.mock("fumadocs-ui/provider/base", () => ({
  RootProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/framework-provider", () => ({
  LocaleAwareFrameworkProvider: ({ children }: { children: ReactNode }) => children,
}));

const { default: Layout } = await import("./layout");

async function umamiScript(): Promise<HTMLScriptElement | null> {
  const tree = await Layout({ params: Promise.resolve({ lang: "en" }), children: null });
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(tree), "text/html");
  return doc.querySelector<HTMLScriptElement>(
    'script[src="https://umami.kreitz-webdev.de/script.js"]',
  );
}

describe("Layout: Umami tracker", () => {
  it("tells the tracker to honour the browser's Do Not Track signal", async () => {
    const script = await umamiScript();

    expect(script?.getAttribute("data-do-not-track")).toBe("true");
  });

  it("loads the tracker from an external file rather than inline code", async () => {
    const script = await umamiScript();

    expect(script?.textContent).toBe("");
    expect(script?.getAttribute("data-website-id")).toBe("fcf007b7-4579-4486-881c-e8686d61d63d");
  });
});

// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../global.css", () => ({}));

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Geist: font, Geist_Mono: font };
});

vi.mock("next/script", () => ({
  default: ({ strategy, ...props }: ComponentProps<"script"> & { strategy?: string }) => (
    <script data-strategy={strategy} {...props} />
  ),
}));

vi.mock("next-intl/server", () => ({
  getMessages: async () => ({}),
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => {},
}));

vi.mock("fumadocs-ui/provider/base", () => ({
  RootProvider: ({ children }: { children: ReactNode }) => children,
  useTheme: () => ({ resolvedTheme: undefined }),
}));

vi.mock("@/lib/framework-provider", () => ({
  LocaleAwareFrameworkProvider: ({ children }: { children: ReactNode }) => children,
}));

const { default: Layout, viewport } = await import("./layout");

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

  it("counts only the production host and ignores URL hashes", async () => {
    const script = await umamiScript();

    expect(script?.getAttribute("data-domains")).toBe("verbatra.kreitz-webdev.de");
    expect(script?.getAttribute("data-exclude-hash")).toBe("true");
  });

  it("loads the tracker after the page load event, so no early preload competes with the first paint", async () => {
    const script = await umamiScript();

    expect(script?.getAttribute("data-strategy")).toBe("lazyOnload");
  });

  it("loads the tracker from an external file rather than inline code", async () => {
    const script = await umamiScript();

    expect(script?.textContent).toBe("");
    expect(script?.getAttribute("data-website-id")).toBe("fcf007b7-4579-4486-881c-e8686d61d63d");
  });
});

describe("Layout: browser chrome", () => {
  it("starts on the dark default, matching the server-rendered html class", async () => {
    const { THEME_COLORS } = await import("@/lib/theme");
    expect(viewport.themeColor).toBe(THEME_COLORS.dark);
    expect(viewport.colorScheme).toBe("dark");
  });
});

describe("Layout: theme before any script", () => {
  it("server-renders the default dark theme class on <html>, so a visitor without JavaScript gets the dark code tokens", async () => {
    const tree = await Layout({ params: Promise.resolve({ lang: "en" }), children: null });
    const markup = renderToStaticMarkup(tree);
    const html = /<html[^>]*class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
    expect(html).toContain("dark");
    expect(html).not.toContain("light");
  });
});

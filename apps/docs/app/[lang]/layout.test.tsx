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

describe("Layout: browser chrome for a stored theme", () => {
  async function chromeScript(): Promise<HTMLScriptElement | null> {
    const tree = await Layout({ params: Promise.resolve({ lang: "en" }), children: null });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(tree), "text/html");
    return doc.body.querySelector<HTMLScriptElement>("script:not([src])");
  }

  function runWith(stored: string | null, script: string): Record<string, string | null> {
    document.head.innerHTML =
      '<meta name="theme-color" content="#0B0B12"><meta name="color-scheme" content="dark">';
    if (stored === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", stored);
    new Function(script)();
    return {
      themeColor:
        document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
      colorScheme:
        document.querySelector('meta[name="color-scheme"]')?.getAttribute("content") ?? null,
    };
  }

  it("opens the body with an inline script, so the chrome follows a stored light theme before the first paint", async () => {
    const script = await chromeScript();
    const { THEME_COLORS } = await import("@/lib/theme");
    expect(script?.parentElement?.firstElementChild).toBe(script);
    expect(runWith("light", script?.textContent ?? "")).toEqual({
      themeColor: THEME_COLORS.light,
      colorScheme: "light",
    });
  });

  it("leaves the dark default alone for no stored theme, the dark one or an unknown value", async () => {
    const script = (await chromeScript())?.textContent ?? "";
    const { THEME_COLORS } = await import("@/lib/theme");
    for (const stored of [null, "dark", "system", "constructor"]) {
      expect(runWith(stored, script)).toEqual({
        themeColor: THEME_COLORS.dark,
        colorScheme: "dark",
      });
    }
  });

  it("reads the key the theme provider stores the choice under", async () => {
    const { THEME_PROVIDER_OPTIONS, THEME_STORAGE_KEY } = await import("@/lib/theme");
    expect(THEME_PROVIDER_OPTIONS.storageKey).toBe(THEME_STORAGE_KEY);
    expect((await chromeScript())?.textContent).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });
});

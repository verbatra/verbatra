// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../global.css", () => ({}));

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Geist: font, Geist_Mono: font };
});

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

const { default: Layout, generateMetadata } = await import("./layout");

describe("Layout: no third-party script", () => {
  it("loads no external script and opens no connection to another origin", async () => {
    const tree = await Layout({ params: Promise.resolve({ lang: "en" }), children: null });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(tree), "text/html");

    expect(doc.querySelectorAll("script[src]")).toHaveLength(0);
    expect(doc.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]')).toHaveLength(
      0,
    );
    expect(renderToStaticMarkup(tree)).not.toContain("umami");
  });
});

describe("Layout: browser chrome", () => {
  it("leaves the theme-color and color-scheme meta tags to the theme script, with the dark pair only for a visitor without JavaScript", async () => {
    expect(await import("./layout")).not.toHaveProperty("viewport");
    const { THEME_COLORS } = await import("@/lib/theme");
    const tree = await Layout({ params: Promise.resolve({ lang: "en" }), children: null });
    const markup = renderToStaticMarkup(tree);
    const head = /<head>([\s\S]*)<\/head>/.exec(markup)?.[1] ?? "";
    expect(head).toContain(
      `<noscript><meta name="theme-color" content="${THEME_COLORS.dark}"/><meta name="color-scheme" content="dark"/></noscript>`,
    );
    expect(markup.replace(/<noscript>[\s\S]*?<\/noscript>/g, "")).not.toMatch(
      /<meta name="(theme-color|color-scheme)"/,
    );
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

describe("Layout: a stored theme before the first paint", () => {
  async function initScript(): Promise<HTMLScriptElement | null> {
    const tree = await Layout({ params: Promise.resolve({ lang: "en" }), children: null });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(tree), "text/html");
    return doc.body.querySelector<HTMLScriptElement>("script:not([src])");
  }

  function runWith(stored: string | null, script: string) {
    document.documentElement.className = "dark";
    document.documentElement.style.colorScheme = "";
    document.head.innerHTML = "";
    if (stored === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", stored);
    new Function(script)();
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(document.querySelectorAll('meta[name="color-scheme"]')).toHaveLength(1);
    return {
      className: document.documentElement.className,
      themeColor:
        document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
      colorScheme:
        document.querySelector('meta[name="color-scheme"]')?.getAttribute("content") ?? null,
    };
  }

  it("opens the body with an inline script that applies a stored light theme to the page and the chrome", async () => {
    const script = await initScript();
    const { THEME_COLORS } = await import("@/lib/theme");
    expect(script?.parentElement?.firstElementChild).toBe(script);
    expect(runWith("light", script?.textContent ?? "")).toEqual({
      className: "light",
      themeColor: THEME_COLORS.light,
      colorScheme: "light",
    });
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("leaves the dark default alone for no stored theme, the dark one or an unknown value", async () => {
    const script = (await initScript())?.textContent ?? "";
    const { THEME_COLORS } = await import("@/lib/theme");
    for (const stored of [null, "dark", "system", "constructor"]) {
      expect(runWith(stored, script)).toEqual({
        className: "dark",
        themeColor: THEME_COLORS.dark,
        colorScheme: "dark",
      });
    }
  });

  it("keeps one pair of tags when it runs again, and leaks no globals", async () => {
    const script = (await initScript())?.textContent ?? "";
    runWith("light", script);
    new Function(script)();
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(document.querySelectorAll('meta[name="color-scheme"]')).toHaveLength(1);
    for (const name of ["c", "t", "s", "d", "p", "m"]) expect(window).not.toHaveProperty(name);
  });

  it("reads the key the theme toggle stores the choice under", async () => {
    const { THEME_STORAGE_KEY } = await import("@/lib/theme");
    const { setTheme } = await import("@/lib/theme-store");
    setTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect((await initScript())?.textContent).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });
});

describe("Layout: Search Console verification", () => {
  it("carries the Google site verification token", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: "en" }) });

    expect(metadata.verification?.google).toBe("z0lelBJ5J1ajeyw1BedyvY1PrGlqa4b8IXZlMVGxRcM");
  });
});

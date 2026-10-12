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
  it("leaves the theme-color and color-scheme meta tags to the theme script, so React never renders a second pair", async () => {
    expect(await import("./layout")).not.toHaveProperty("viewport");
    const tree = await Layout({ params: Promise.resolve({ lang: "en" }), children: null });
    expect(renderToStaticMarkup(tree)).not.toMatch(/<meta name="(theme-color|color-scheme)"/);
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

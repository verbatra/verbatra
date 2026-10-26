// @vitest-environment jsdom

import { SearchProvider } from "fumadocs-ui/contexts/search";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import type { Locale } from "@/lib/i18n";
import messages from "@/messages/en.json";

const location = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("fumadocs-core/framework", () => ({ usePathname: () => location.pathname }));
vi.mock("fumadocs-core/link", () => ({
  default: ({
    children,
    external: _external,
    prefetch,
    ...props
  }: ComponentProps<"a"> & { external?: boolean; prefetch?: boolean }) => (
    <a data-prefetch={prefetch === undefined ? undefined : String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: catalog } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages: catalog, namespace: namespace as never }),
  };
});
vi.mock("@/components/chrome-islands", async () => ({
  LanguageSelect: ({ children }: { children?: ReactNode }) => (
    <button type="button" data-language>
      {children}
    </button>
  ),
  ThemeToggle: () => <button type="button" data-theme-toggle />,
  HomeMobileMenu: (await import("./home-mobile-menu")).HomeMobileMenu,
}));
vi.mock("fumadocs-ui/layouts/notebook", () => ({ useNotebookLayout: () => ({}) }));
vi.mock("@/components/root-tabs", () => ({ useRootTabs: () => ({ tabs: [] }) }));

const { HomeNavProvider } = await import("./home-nav");
const { HomeSiteHeader } = await import("./site-header");
const { homeNavValue } = await import("@/lib/locale-home-layout");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = messages.landing.topNav;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function SearchDialogStub({ open }: { open: boolean }): ReactNode {
  return open ? <div role="dialog" data-search-dialog /> : null;
}

async function render(locale: Locale = "en"): Promise<HTMLDivElement> {
  const value = await homeNavValue(locale);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <SearchProvider SearchDialog={SearchDialogStub} preload={false}>
        <HomeNavProvider value={value}>
          <HomeSiteHeader wordmark="verbatra" homeUrl="/" />
        </HomeNavProvider>
      </SearchProvider>,
    ),
  );
  mounted = { container, root };
  return container;
}

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: en } = await import("@/messages/en.json");
  const { default: de } = await import("@/messages/de.json");
  return {
    getTranslations: async ({ locale, namespace }: { locale: "en" | "de"; namespace: string }) =>
      createTranslator({
        locale,
        messages: locale === "de" ? de : en,
        namespace: namespace as never,
      }),
  };
});

afterEach(() => {
  location.pathname = "/";
  if (mounted) act(() => mounted?.root.unmount());
  mounted = undefined;
  document.body.innerHTML = "";
});

function primaryNav(container: HTMLElement): HTMLElement | null {
  return container.querySelector("header nav[aria-label]");
}

function sheet(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}

function trigger(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector(`button[aria-label="${nav.menu.open}"]`);
}

function pressEscape(): void {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

describe("the landing nav", () => {
  it("holds Docs and Reference in a nav named Main, with GitHub as an icon button", async () => {
    const container = await render();
    const links = Array.from(primaryNav(container)?.querySelectorAll("a") ?? []);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/docs", "/docs/cli"]);
    expect(links.map((link) => link.textContent)).toEqual([
      messages.landing.nav.docs,
      messages.landing.nav.reference,
    ]);
    const github = container.querySelector(`header a[href="${GITHUB_URL}"]`);
    expect(github?.getAttribute("aria-label")).toBe(`GitHub ${messages.landing.openSource.newTab}`);
    expect(github?.textContent).toBe("");
    expect(container.querySelector("header a.vk-nav-cta")).toBeNull();
  });

  it("marks every header control with the phone tap class on the rendered elements", async () => {
    const container = await render();
    const controls = [
      container.querySelector('header a[href="/"]'),
      ...Array.from(primaryNav(container)?.querySelectorAll("a") ?? []),
      container.querySelector("header button[data-search]"),
      trigger(container),
    ];
    expect(controls).toHaveLength(5);
    for (const control of controls) expect(control?.classList.contains("vk-tap")).toBe(true);
    act(() => trigger(container)?.click());
    const items = Array.from(sheet()?.querySelectorAll(`nav[aria-label="${nav.label}"] a`) ?? []);
    expect(items).toHaveLength(3);
    for (const item of items) expect(item.classList.contains("min-h-11")).toBe(true);
  });

  it("carries the docs search trigger, wide from md and as an icon button below", async () => {
    const container = await render();
    const full = container.querySelector("header button[data-search-full]");
    expect(full?.className).toContain("max-md:hidden");
    expect(full?.textContent).toContain("Search");
    expect(container.querySelector("header button[data-search]")).not.toBeNull();
  });

  it("opens the search dialog from the wide trigger, the phone button and the hotkey", async () => {
    const container = await render();
    const dialog = () => document.querySelector("[data-search-dialog]");
    act(() => container.querySelector<HTMLButtonElement>("button[data-search-full]")?.click());
    expect(dialog()).not.toBeNull();
    act(() => mounted?.root.unmount());
    document.body.innerHTML = "";
    const phone = await render();
    act(() => phone.querySelector<HTMLButtonElement>("button[data-search]")?.click());
    expect(dialog()).not.toBeNull();
    act(() => mounted?.root.unmount());
    document.body.innerHTML = "";
    await render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });
    expect(dialog()).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });
    expect(dialog()).toBeNull();
  });

  it("keeps the wordmark link mounted when the header re-renders with a new home URL", async () => {
    const container = await render();
    const value = await homeNavValue("en");
    const title = () =>
      container.querySelector<HTMLAnchorElement>("header a[href='/'], header a[href='/de']");
    const before = title();
    expect(before?.textContent).toBe("verbatra");
    act(() =>
      mounted?.root.render(
        <SearchProvider SearchDialog={SearchDialogStub} preload={false}>
          <HomeNavProvider value={value}>
            <HomeSiteHeader wordmark="verbatra" homeUrl="/de" />
          </HomeNavProvider>
        </SearchProvider>,
      ),
    );
    expect(title()).toBe(before);
    expect(before?.getAttribute("href")).toBe("/de");
  });

  it("does not prefetch the home page from its own wordmark", async () => {
    const container = await render();
    const title = container.querySelector<HTMLAnchorElement>("header a[href='/']");
    expect(title?.getAttribute("data-prefetch")).toBe("false");
  });

  it("lines its row up with the docs header: the layout width and its padding", async () => {
    const row = (await render()).querySelector(".vk-header-row");
    expect(row?.className).toContain("max-w-(--fd-layout-width)");
    expect(row?.className).toContain("px-4");
    expect(row?.className).toContain("md:px-6");
    expect(row?.className).not.toContain("--width-wide");
  });

  it("marks Docs active on the docs home only", async () => {
    location.pathname = "/de/docs";
    const docs = primaryNav(await render("de"))?.querySelector('a[href="/de/docs"]');
    expect(docs?.getAttribute("data-active")).toBe("true");
    expect(docs?.getAttribute("aria-current")).toBe("page");
  });

  it("keeps the language and theme controls in the bar and drops the version pill", async () => {
    const container = await render();
    expect(container.querySelector("header .vk-version-pill")).toBeNull();
    expect(container.querySelector("header [data-language]")).not.toBeNull();
    expect(container.querySelector("header [data-theme-toggle]")).not.toBeNull();
  });

  it("refuses to render without its provider", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      act(() => root.render(<HomeSiteHeader wordmark="verbatra" homeUrl="/" />)),
    ).toThrow(/HomeNavProvider/);
    error.mockRestore();
  });
});

describe("the landing phone menu", () => {
  it("opens a dialog titled Menu that holds the nav, the language select and the theme toggle", async () => {
    const container = await render();
    const open = trigger(container);
    expect(open?.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      open?.focus();
      open?.click();
    });
    const dialog = sheet();
    expect(dialog).not.toBeNull();
    expect(open?.getAttribute("aria-expanded")).toBe("true");
    const titleId = dialog?.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(titleId)?.textContent).toBe(nav.menu.title);
    const links = Array.from(dialog?.querySelectorAll(`nav[aria-label="${nav.label}"] a`) ?? []);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/docs",
      "/docs/cli",
      GITHUB_URL,
    ]);
    expect(dialog?.querySelector("[data-language]")).not.toBeNull();
    expect(dialog?.querySelector("[data-theme-toggle]")).not.toBeNull();
  });

  it("moves focus into the dialog and labels its close button", async () => {
    const container = await render();
    act(() => trigger(container)?.click());
    const dialog = sheet();
    expect(dialog?.contains(document.activeElement)).toBe(true);
    const close = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === nav.menu.close,
    );
    expect(close).toBeDefined();
  });

  it("puts focus on the first nav link when it opens, then the footer controls and the close button", async () => {
    const container = await render();
    act(() => trigger(container)?.click());
    const dialog = sheet();
    expect(document.activeElement?.getAttribute("href")).toBe("/docs");
    const order = Array.from(dialog?.querySelectorAll<HTMLElement>("a[href], button") ?? []).map(
      (node) =>
        node.getAttribute("href") ??
        (node.hasAttribute("data-language")
          ? "language"
          : node.hasAttribute("data-theme-toggle")
            ? "theme"
            : node.textContent),
    );
    expect(order).toEqual(["/docs", "/docs/cli", GITHUB_URL, "language", "theme", nav.menu.close]);
  });

  it("names the GitHub item with a new-tab hint", async () => {
    const container = await render();
    act(() => trigger(container)?.click());
    const github = sheet()?.querySelector<HTMLAnchorElement>(`a[href="${GITHUB_URL}"]`);
    expect(github?.textContent).toBe(`GitHub ${messages.landing.openSource.newTab}`);
  });

  it("draws the close button focus with the shared outline, not a second ring, on a 44px target", async () => {
    const container = await render();
    act(() => trigger(container)?.click());
    const close = Array.from(sheet()?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === nav.menu.close,
    );
    expect(close?.className).not.toMatch(/focus:ring|focus:outline-hidden|ring-offset/);
    expect(close?.className).toContain("size-11");
  });

  it("closes on Escape and hands focus back to the menu button", async () => {
    const container = await render();
    const open = trigger(container);
    act(() => {
      open?.focus();
      open?.click();
    });
    pressEscape();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it("closes from its close button", async () => {
    const container = await render();
    act(() => trigger(container)?.click());
    const close = Array.from(sheet()?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === nav.menu.close,
    );
    act(() => close?.click());
    expect(sheet()).toBeNull();
  });

  it("closes when Docs is followed", async () => {
    const container = await render();
    act(() => trigger(container)?.click());
    act(() => sheet()?.querySelector<HTMLAnchorElement>('a[href="/docs"]')?.click());
    expect(sheet()).toBeNull();
  });

  it("localizes the menu links in German", async () => {
    const value = await homeNavValue("de");
    const urls = value.links.map((item) => ("url" in item ? item.url : undefined));
    expect(urls.slice(0, 2)).toEqual(["/de/docs", "/de/docs/cli"]);
  });
});

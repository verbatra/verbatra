// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GITHUB_URL, RELEASES_URL } from "@/components/landing/links";
import messages from "@/messages/en.json";

const location = vi.hoisted(() => ({ pathname: "/" }));
const track = vi.hoisted(() => vi.fn());

vi.mock("@/lib/umami", () => ({ trackUmamiEvent: track }));
vi.mock("fumadocs-core/framework", () => ({ usePathname: () => location.pathname }));
vi.mock("fumadocs-core/link", () => ({
  default: ({
    children,
    external: _external,
    ...props
  }: ComponentProps<"a"> & { external?: boolean }) => <a {...props}>{children}</a>,
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
vi.mock("fumadocs-ui/layouts/home", () => ({
  useHomeLayout: () => ({
    slots: {
      navTitle: (props: ComponentProps<"a">) => (
        <a href="/" {...props}>
          VERBATRA
        </a>
      ),
      searchTrigger: {
        full: () => <button type="button" data-search="full" />,
        sm: () => <button type="button" data-search="sm" />,
      },
      languageSelect: {
        root: ({ children }: { children?: ReactNode }) => (
          <button type="button" data-language>
            {children}
          </button>
        ),
      },
      themeSwitch: () => <button type="button" data-theme-toggle />,
    },
  }),
}));
vi.mock("fumadocs-ui/layouts/notebook", () => ({ useNotebookLayout: () => ({}) }));
vi.mock("@/components/root-tabs", () => ({ useRootTabs: () => ({ tabs: [] }) }));

const { HomeNavProvider, docsLinkState } = await import("./home-nav");
const { HomeSiteHeader } = await import("./site-header");
const { homeNavValue } = await import("@/lib/locale-home-layout");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = messages.landing.topNav;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function render(stars: number | null, locale: "en" | "de" = "en"): Promise<HTMLDivElement> {
  const value = await homeNavValue(locale, stars);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <HomeNavProvider value={value}>
        <HomeSiteHeader />
      </HomeNavProvider>,
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

vi.mock("@/lib/layout.shared", () => ({ baseOptions: async () => ({}) }));

afterEach(() => {
  track.mockReset();
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
  it("holds Docs, Changelog and GitHub in a nav named Main, then Get started", async () => {
    const container = await render(1234);
    const links = Array.from(primaryNav(container)?.querySelectorAll("a") ?? []);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/docs",
      RELEASES_URL,
      GITHUB_URL,
    ]);
    expect(links[0]?.textContent).toBe(nav.docs);
    expect(links[1]?.textContent).toBe(nav.changelog);
    const cta = container.querySelector("header a.vk-nav-cta");
    expect(cta?.textContent).toBe(nav.getStarted);
    expect(cta?.getAttribute("href")).toBe("/docs/quickstart");
    expect(cta?.closest("nav")).toBeNull();
  });

  it("drops the search box from the landing bar", async () => {
    expect((await render(null)).querySelector("[data-search]")).toBeNull();
  });

  it("opens Changelog and GitHub in a new tab and counts them as outbound links", async () => {
    const container = await render(null);
    const [, changelog, github] = Array.from(primaryNav(container)?.querySelectorAll("a") ?? []);
    for (const link of [changelog, github]) {
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    }
    act(() => changelog?.click());
    act(() => github?.click());
    expect(track.mock.calls).toEqual([
      ["outbound-link", { target: "changelog", location: "header" }],
      ["outbound-link", { target: "github", location: "header" }],
    ]);
  });

  it("shows the server-fetched star count inside the GitHub link and names it", async () => {
    const github = primaryNav(await render(1234))?.querySelector(`a[href="${GITHUB_URL}"]`);
    expect(github?.querySelector("[data-stars]")?.textContent).toBe("1.2K");
    expect(github?.getAttribute("aria-label")).toBe("1.2K stars on GitHub");
    expect(github?.textContent).toBe("GitHub1.2K");
  });

  it("renders a plain GitHub link with no number and no empty slot without a count", async () => {
    const github = primaryNav(await render(null))?.querySelector(`a[href="${GITHUB_URL}"]`);
    expect(github?.querySelector("[data-stars]")).toBeNull();
    expect(github?.hasAttribute("aria-label")).toBe(false);
    expect(github?.textContent).toBe(nav.github);
  });

  it("lines its row up with the landing sections: the wide width and the section gutter", async () => {
    const row = (await render(null)).querySelector(".vk-header-row");
    expect(row?.className).toContain("max-w-(--width-wide)");
    expect(row?.className).toContain("px-(--gutter)");
    expect(row?.className).not.toContain("--fd-layout-width");
  });

  it("counts Get started as a header call to action", async () => {
    const container = await render(null);
    act(() => container.querySelector<HTMLAnchorElement>("a.vk-nav-cta")?.click());
    expect(track).toHaveBeenCalledWith("click-cta", { location: "header", target: "get-started" });
  });

  it("marks Docs active and current on the docs pages only", async () => {
    expect(docsLinkState("/docs", "/docs")).toEqual({ active: true, current: "page" });
    expect(docsLinkState("/docs", "/docs/cli/")).toEqual({ active: true, current: "true" });
    expect(docsLinkState("/docs", "/docsearch")).toEqual({ active: false, current: undefined });
    location.pathname = "/de/docs/formats";
    const docs = primaryNav(await render(null, "de"))?.querySelector("a");
    expect(docs?.getAttribute("href")).toBe("/de/docs");
    expect(docs?.getAttribute("data-active")).toBe("true");
    expect(docs?.getAttribute("aria-current")).toBe("true");
  });

  it("keeps the version pill and the language and theme controls in the bar", async () => {
    const container = await render(null);
    expect(container.querySelector("header .vk-version-pill")).not.toBeNull();
    expect(container.querySelector("header [data-language]")).not.toBeNull();
    expect(container.querySelector("header [data-theme-toggle]")).not.toBeNull();
  });

  it("refuses to render without its provider", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => act(() => root.render(<HomeSiteHeader />))).toThrow(/HomeNavProvider/);
    error.mockRestore();
  });
});

describe("the landing phone menu", () => {
  it("opens a dialog titled Menu that holds the nav, the language select and the theme toggle", async () => {
    const container = await render(1234);
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
      RELEASES_URL,
      GITHUB_URL,
    ]);
    expect(dialog?.querySelector("[data-stars]")?.textContent).toBe("1.2K");
    expect(dialog?.querySelector("[data-language]")).not.toBeNull();
    expect(dialog?.querySelector("[data-theme-toggle]")).not.toBeNull();
  });

  it("moves focus into the dialog and labels its close button", async () => {
    const container = await render(null);
    act(() => trigger(container)?.click());
    const dialog = sheet();
    expect(dialog?.contains(document.activeElement)).toBe(true);
    const close = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === nav.menu.close,
    );
    expect(close).toBeDefined();
  });

  it("puts focus on the first nav link when it opens, then the call to action, the footer controls and the close button", async () => {
    const container = await render(null);
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
    expect(order).toEqual([
      "/docs",
      RELEASES_URL,
      GITHUB_URL,
      "/docs/quickstart",
      "language",
      "theme",
      nav.menu.close,
    ]);
  });

  it("draws the close button focus with the shared outline, not a second ring, on a 44px target", async () => {
    const container = await render(null);
    act(() => trigger(container)?.click());
    const close = Array.from(sheet()?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === nav.menu.close,
    );
    expect(close?.className).not.toMatch(/focus:ring|focus:outline-hidden|ring-offset/);
    expect(close?.className).toContain("size-11");
  });

  it("closes on Escape and hands focus back to the menu button", async () => {
    const container = await render(null);
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
    const container = await render(null);
    act(() => trigger(container)?.click());
    const close = Array.from(sheet()?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === nav.menu.close,
    );
    act(() => close?.click());
    expect(sheet()).toBeNull();
  });

  it("offers Get started below the nav, counted from the menu, and closes when followed", async () => {
    const container = await render(null);
    act(() => trigger(container)?.click());
    const cta = sheet()?.querySelector<HTMLAnchorElement>("a.vk-nav-cta-menu");
    expect(cta?.getAttribute("href")).toBe("/docs/quickstart");
    expect(cta?.textContent).toBe(nav.getStarted);
    expect(cta?.closest("nav")).toBeNull();
    act(() => cta?.click());
    expect(track).toHaveBeenCalledWith("click-cta", { location: "menu", target: "get-started" });
    expect(sheet()).toBeNull();
  });

  it("closes when Docs is followed and counts outbound links from the menu", async () => {
    const container = await render(null);
    act(() => trigger(container)?.click());
    const changelog = sheet()?.querySelector<HTMLAnchorElement>(`a[href="${RELEASES_URL}"]`);
    act(() => changelog?.click());
    expect(track).toHaveBeenCalledWith("outbound-link", { target: "changelog", location: "menu" });
    act(() => sheet()?.querySelector<HTMLAnchorElement>('a[href="/docs"]')?.click());
    expect(sheet()).toBeNull();
  });
});

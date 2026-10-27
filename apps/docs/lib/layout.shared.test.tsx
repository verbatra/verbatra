// @vitest-environment jsdom

import { SearchProvider } from "fumadocs-ui/contexts/search";
import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preloadRegisteredIslands } from "@/test-support/islands";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `nav.${key}`,
}));
vi.mock("next-intl", async (importOriginal) => {
  const { createTranslator } = await importOriginal<typeof import("next-intl")>();
  const { default: messages } = await import("@/messages/en.json");
  return {
    useTranslations: (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});
const location = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("fumadocs-core/framework", () => ({ usePathname: () => location.pathname }));
vi.mock("fumadocs-core/link", () => ({
  default: ({
    children,
    external: _external,
    ...props
  }: ComponentProps<"a"> & { external?: boolean }) => <a {...props}>{children}</a>,
}));
vi.mock("fumadocs-ui/layouts/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("fumadocs-ui/layouts/shared")>()),
  LinkItem: ({ item, children, ...props }: ComponentProps<"a"> & { item: { url: string } }) => (
    <a href={item.url} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/chrome-islands", async () => ({
  LanguageSelect: () => null,
  ThemeToggle: () => null,
  HomeMobileMenu: (await import("@/components/home-mobile-menu")).HomeMobileMenu,
}));
vi.mock("fumadocs-ui/layouts/notebook", () => ({ useNotebookLayout: () => ({}) }));
vi.mock("@/components/root-tabs", () => ({ useRootTabs: () => ({ tabs: [] }) }));
vi.mock("fumadocs-ui/components/sidebar/base", () => {
  const passThrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    SidebarProvider: passThrough,
    SidebarViewport: passThrough,
    SidebarDrawerOverlay: () => null,
    SidebarTrigger: ({ children }: { children?: ReactNode }) => (
      <button type="button" data-sidebar-trigger>
        {children}
      </button>
    ),
    SidebarDrawerContent: ({ children }: { children?: ReactNode }) => (
      <div data-drawer>{children}</div>
    ),
    useSidebar: () => ({ open: false, mode: "drawer", setOpen: () => undefined }),
  };
});

const { baseOptions } = await import("./layout.shared");
const { headerLinks: sharedHeaderLinks } = await import("./header-links");
const { HomeSiteHeader } = await import("@/components/site-header");
const { HomeNavProvider } = await import("@/components/home-nav");

await preloadRegisteredIslands();

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORBIDDEN_TARGETS = [/start-with-ai/, /CONTRIBUTING/, /npmjs\.com/, /\/contact$/];

async function headerLinks(locale: "en" | "de" = "en"): Promise<LinkItemType[]> {
  return (await baseOptions(locale)).links ?? [];
}

function describeItem(item: LinkItemType): string {
  const url = "url" in item ? item.url : "";
  return `${item.type ?? "main"}:${url}`;
}

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function navValue(locale: "en" | "de") {
  return {
    links: sharedHeaderLinks(locale, { docs: "nav.docs", reference: "nav.reference" }),
    labels: {
      label: "Main",
      menuOpen: "Open menu",
      menuClose: "Close menu",
      menuTitle: "Menu",
      newTab: "(opens in a new tab)",
    },
  };
}

async function renderHomeHeader(locale: "en" | "de" = "en"): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <SearchProvider SearchDialog={() => null} preload={false}>
        <HomeNavProvider value={navValue(locale)}>
          <HomeSiteHeader wordmark="verbatra" homeUrl="/" />
        </HomeNavProvider>
      </SearchProvider>,
    ),
  );
  mounted = { container, root };
  return container;
}

function hrefs(scope: Element | null | undefined, selector: string): Array<string | null> {
  return Array.from(scope?.querySelectorAll(selector) ?? [], (link) => link.getAttribute("href"));
}

afterEach(() => {
  location.pathname = "/";
  if (!mounted) return;
  act(() => mounted?.root.unmount());
  mounted.container.remove();
  mounted = undefined;
});

describe("search options", () => {
  it("loads the search dialog on first open, not on every page load", async () => {
    const { SEARCH_OPTIONS } = await import("./root-provider-options");
    expect(SEARCH_OPTIONS.preload).toBe(false);
  });

  it("uses the dialog that hands focus back to its opener on close", async () => {
    const { SEARCH_OPTIONS } = await import("./root-provider-options");
    const { FocusRestoringSearchDialog } = await import(
      "@/components/focus-restoring-search-dialog"
    );
    expect(SEARCH_OPTIONS.SearchDialog).toBe(FocusRestoringSearchDialog);
  });
});

describe("wordmark", () => {
  it("writes the header wordmark in lowercase with tight tracking, like the footer", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<>{(await baseOptions("en")).nav?.title}</>);
    const word = Array.from(container.querySelectorAll("span")).find(
      (span) => span.children.length === 0,
    );
    expect(word?.textContent).toBe("verbatra");
    expect(word?.className).not.toMatch(/uppercase|tracking-widest/);
  });
});

describe("primary navigation", () => {
  it("holds Docs, Reference and the GitHub icon, nothing else", async () => {
    expect((await headerLinks()).map(describeItem)).toEqual([
      "main:/docs",
      "main:/docs/cli",
      "icon:https://github.com/verbatra/verbatra",
    ]);
  });

  it("links neither the AI setup guide, the contributor guide, npm nor the contact page", async () => {
    for (const item of await headerLinks()) {
      const url = "url" in item ? (item.url ?? "") : "";
      for (const target of FORBIDDEN_TARGETS) expect(url).not.toMatch(target);
    }
  });

  it("gives the landing bar the docs header's links and none of the forbidden targets", async () => {
    const container = await renderHomeHeader();
    expect(hrefs(container.querySelector("header"), "nav a")).toEqual(["/docs", "/docs/cli"]);
    expect(
      hrefs(container.querySelector("header"), "a[aria-label='GitHub (opens in a new tab)']"),
    ).toEqual(["https://github.com/verbatra/verbatra"]);
    for (const href of hrefs(container, "a")) {
      for (const target of FORBIDDEN_TARGETS) expect(href ?? "").not.toMatch(target);
    }
  });

  it("prefixes the landing bar's internal links with a non-default locale", async () => {
    const container = await renderHomeHeader("de");
    expect(hrefs(container.querySelector("header"), "nav a")).toEqual(["/de/docs", "/de/docs/cli"]);
  });

  it("gives the landing bar the docs search trigger and no call to action or version pill", async () => {
    const header = (await renderHomeHeader()).querySelector("header");
    expect(header?.querySelector("button[data-search-full]")).not.toBeNull();
    expect(header?.querySelector("button[data-search]")).not.toBeNull();
    expect(header?.querySelector(".vk-version-pill, .vk-nav-cta")).toBeNull();
  });
});

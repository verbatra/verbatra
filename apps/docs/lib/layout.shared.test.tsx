// @vitest-environment jsdom

import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const homeLayout = vi.hoisted(() => ({
  current: undefined as unknown,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `nav.${key}`,
}));
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
vi.mock("fumadocs-ui/layouts/home", () => ({ useHomeLayout: () => homeLayout.current }));
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
  };
});

const { baseOptions } = await import("./layout.shared");
const { HomeSiteHeader } = await import("@/components/site-header");

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

async function renderHomeHeader(locale: "en" | "de" = "en"): Promise<HTMLDivElement> {
  const links = await headerLinks(locale);
  homeLayout.current = {
    slots: {},
    navItems: links.filter((item) => item.on !== "menu"),
    menuItems: links.filter((item) => item.on !== "nav"),
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<HomeSiteHeader />));
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

  it("renders the same items in the header bar and in the phone drawer", async () => {
    const container = await renderHomeHeader();
    const header = container.querySelector("header");
    const drawer = container.querySelector("[data-drawer]");

    expect(hrefs(header, "nav a")).toEqual(["/docs", "/docs/cli"]);
    expect(hrefs(header, "a[aria-label]")).toEqual(["https://github.com/verbatra/verbatra"]);
    expect(
      Array.from(drawer?.querySelectorAll("a:not([aria-label])") ?? [], (a) => a.textContent),
    ).toEqual(["nav.docs", "nav.reference"]);
    expect(hrefs(drawer, "a[aria-label]")).toEqual(["https://github.com/verbatra/verbatra"]);
    for (const href of hrefs(container, "a")) {
      for (const target of FORBIDDEN_TARGETS) expect(href ?? "").not.toMatch(target);
    }
  });

  it("prefixes the header and drawer links with a non-default locale", async () => {
    const container = await renderHomeHeader("de");
    const drawer = container.querySelector("[data-drawer]");

    expect(hrefs(container.querySelector("header"), "nav a")).toEqual(["/de/docs", "/de/docs/cli"]);
    expect(hrefs(drawer, "a:not([aria-label])")).toEqual(["/de/docs", "/de/docs/cli"]);
  });

  it("marks the drawer item of the current page as active and current", async () => {
    location.pathname = "/docs";
    const drawer = (await renderHomeHeader()).querySelector("[data-drawer]");
    const docs = drawer?.querySelector('a[href="/docs"]');
    const reference = drawer?.querySelector('a[href="/docs/cli"]');

    expect(docs?.getAttribute("data-active")).toBe("true");
    expect(docs?.getAttribute("aria-current")).toBe("page");
    expect(reference?.getAttribute("data-active")).toBe("false");
    expect(reference?.hasAttribute("aria-current")).toBe(false);
  });
});

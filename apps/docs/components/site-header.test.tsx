// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({ pathname: "/" }));
const track = vi.hoisted(() => vi.fn());

vi.mock("@/lib/umami", () => ({ trackUmamiEvent: track }));

vi.mock("fumadocs-core/framework", () => ({ usePathname: () => location.pathname }));

vi.mock("fumadocs-ui/layouts/shared", () => ({
  isLinkItemActive: (item: { url: string }, pathname: string) => item.url === pathname,
  LinkItem: ({
    item,
    children,
    ...props
  }: ComponentProps<"a"> & { item: { url: string; external?: boolean } }) => (
    <a href={item.url} data-active="false" {...props}>
      {children}
    </a>
  ),
}));

vi.mock("fumadocs-core/link", () => ({
  default: ({
    children,
    external: _external,
    ...props
  }: ComponentProps<"a"> & { external?: boolean }) => <a {...props}>{children}</a>,
}));

vi.mock("@/components/root-tabs", () => ({ useRootTabs: () => ({ tabs: [] }) }));

vi.mock("fumadocs-ui/layouts/home", () => ({ useHomeLayout: () => ({}) }));
vi.mock("fumadocs-ui/layouts/notebook", () => ({ useNotebookLayout: () => ({}) }));
vi.mock("fumadocs-ui/components/sidebar/base", () => ({
  SidebarProvider: () => null,
  SidebarTrigger: () => null,
  SidebarDrawerOverlay: () => null,
  SidebarDrawerContent: () => null,
  SidebarViewport: () => null,
}));

const { SiteHeaderFrame } = await import("./site-header");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SLOTS = {
  navTitle: (props: ComponentProps<"a">) => (
    <a href="/" {...props}>
      VERBATRA
    </a>
  ),
  searchTrigger: {
    full: (props: ComponentProps<"button">) => (
      <button type="button" data-search="full" {...props}>
        Search
      </button>
    ),
    sm: (props: ComponentProps<"button">) => (
      <button type="button" data-search="sm" {...props}>
        Search
      </button>
    ),
  },
  languageSelect: {
    root: ({ children }: { children?: React.ReactNode }) => (
      <button type="button" data-language>
        {children}
      </button>
    ),
  },
} as unknown as ComponentProps<typeof SiteHeaderFrame>["slots"];

const ITEMS: ComponentProps<typeof SiteHeaderFrame>["navItems"] = [
  { text: "Docs", url: "/docs" },
  { text: "Reference", url: "/docs/cli" },
  {
    type: "icon",
    text: "GitHub",
    label: "GitHub",
    icon: <svg aria-hidden="true" />,
    url: "https://github.com/verbatra/verbatra",
    external: true,
  },
];

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(
  activeOverride?: ComponentProps<typeof SiteHeaderFrame>["activeOverride"],
  trailing: ReactNode = <span data-trailing />,
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SiteHeaderFrame
        id="nd-nav"
        slots={SLOTS}
        navItems={ITEMS}
        mobileTrigger={<button type="button" data-mobile />}
        trailing={trailing}
        {...(activeOverride ? { activeOverride } : {})}
      />,
    );
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  track.mockReset();
  location.pathname = "/";
  if (!mounted) return;
  act(() => mounted?.root.unmount());
  mounted.container.remove();
  mounted = undefined;
});

describe("SiteHeaderFrame", () => {
  it("renders the title, both search triggers, the language select and the mobile trigger", () => {
    const container = render();
    expect(container.querySelector("header#nd-nav.vk-header")).not.toBeNull();
    expect(container.textContent).toContain("VERBATRA");
    expect(container.querySelector('[data-search="full"]')).not.toBeNull();
    expect(container.querySelector('[data-search="sm"]')).not.toBeNull();
    expect(container.querySelector("[data-language]")).not.toBeNull();
    expect(container.querySelector("[data-mobile]")).not.toBeNull();
    expect(container.querySelector("[data-trailing]")).not.toBeNull();
  });

  it("renders text links inside the nav and icon links as labelled buttons", () => {
    const container = render();
    const textLinks = Array.from(container.querySelectorAll("nav a.vk-header-link"));
    expect(textLinks.map((link) => link.textContent)).toEqual(["Docs", "Reference"]);
    const icon = container.querySelector('a[aria-label="GitHub"]');
    expect(icon).not.toBeNull();
    expect(icon?.closest("nav")).toBeNull();
  });

  it("counts the external GitHub icon as an outbound link from the header", () => {
    const icon = render().querySelector<HTMLElement>('a[aria-label="GitHub"]');
    act(() => {
      icon?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(track.mock.calls).toEqual([["outbound-link", { target: "github", location: "header" }]]);
  });

  it("keeps each text link on one line, since the squeezed nav wraps them at 1024px otherwise", () => {
    const container = render();
    for (const link of container.querySelectorAll("nav a.vk-header-link")) {
      expect(link.classList.contains("whitespace-nowrap")).toBe(true);
    }
  });

  it("takes the active state of a tab link from the override, on nested pages too", () => {
    const container = render((url) => (url === "/docs" ? true : undefined));
    const states = Array.from(container.querySelectorAll("nav a.vk-header-link")).map((link) => [
      link.textContent,
      link.getAttribute("data-active"),
    ]);
    expect(states).toEqual([
      ["Docs", "true"],
      ["Reference", "false"],
    ]);
    expect(container.querySelector('nav a[href="/docs"]')?.getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("marks a tab link as the current page when the path is exactly its target", () => {
    location.pathname = "/docs/";
    const container = render((url) => (url === "/docs" ? true : undefined));
    expect(container.querySelector('nav a[href="/docs"]')?.getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("falls back to the current path when the override has no opinion, and marks it current", () => {
    location.pathname = "/docs/cli";
    const container = render(() => undefined);
    const reference = container.querySelector('nav a[href="/docs/cli"]');
    const docs = container.querySelector('nav a[href="/docs"]');
    expect(reference?.getAttribute("data-active")).toBe("true");
    expect(reference?.getAttribute("aria-current")).toBe("page");
    expect(docs?.hasAttribute("aria-current")).toBe(false);
  });

  it("shows the text links and icon links from the md breakpoint, where the menu trigger hides", () => {
    const container = render();
    expect(container.querySelector("nav")?.classList.contains("max-md:hidden")).toBe(true);
    expect(
      container.querySelector('a[aria-label="GitHub"]')?.classList.contains("max-md:hidden"),
    ).toBe(true);
    expect(
      container.querySelector("[data-mobile]")?.parentElement?.classList.contains("md:hidden"),
    ).toBe(true);
  });

  it("reserves no empty slot after the language select when there is no trailing control", () => {
    const container = render(undefined, null);
    const language = container.querySelector("[data-language]");
    expect(language?.nextElementSibling).toBeNull();
  });

  it("renders a tab link inactive when the override says so", () => {
    const container = render((url) => (url === "/docs" ? false : undefined));
    const docs = container.querySelector('nav a[href="/docs"]');
    expect(docs?.getAttribute("data-active")).toBe("false");
    expect(docs?.hasAttribute("aria-current")).toBe(false);
  });
});

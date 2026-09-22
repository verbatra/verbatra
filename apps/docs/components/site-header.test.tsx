// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("fumadocs-ui/layouts/shared", () => ({
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
  { text: "Start with AI", url: "/docs/start-with-ai" },
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

function render(): HTMLDivElement {
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
        trailing={<span data-trailing />}
      />,
    );
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
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
    expect(textLinks.map((link) => link.textContent)).toEqual(["Docs", "Start with AI"]);
    const icon = container.querySelector('a[aria-label="GitHub"]');
    expect(icon).not.toBeNull();
    expect(icon?.closest("nav")).toBeNull();
  });
});

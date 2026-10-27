// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const tree = vi.hoisted(() => ({ rootId: "reference" as string | undefined }));

vi.mock("fumadocs-core/link", () => ({
  default: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("fumadocs-ui/contexts/tree", () => ({
  useTreeContext: () => ({ root: { $id: tree.rootId } }),
}));

const { RootTabsProvider, SidebarTabs } = await import("./root-tabs");

const TABS = [
  { id: "docs", title: "Docs", url: "/de/docs" },
  { id: "reference", title: "Reference", url: "/de/docs/cli" },
];

function render(tabs = TABS): Document {
  const markup = renderToStaticMarkup(
    <RootTabsProvider tabs={tabs}>
      <SidebarTabs />
    </RootTabsProvider>,
  );
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("SidebarTabs", () => {
  it("renders every tab as a plain label link, not a select", () => {
    const doc = render();
    const links = [...doc.querySelectorAll("a")];
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Docs", "/de/docs"],
      ["Reference", "/de/docs/cli"],
    ]);
    expect(links.every((link) => link.classList.contains("vk-label"))).toBe(true);
    expect(doc.querySelector("button, select, [role=combobox]")).toBeNull();
  });

  it("marks only the tab of the current root folder as current", () => {
    tree.rootId = "reference";
    const current = [...render().querySelectorAll("a[aria-current]")];
    expect(current.map((link) => [link.textContent, link.getAttribute("aria-current")])).toEqual([
      ["Reference", "true"],
    ]);
  });

  it("marks no tab when the page sits outside every tab", () => {
    tree.rootId = undefined;
    expect(render().querySelector("a[aria-current]")).toBeNull();
  });

  it("renders nothing without tabs", () => {
    expect(render([]).body.innerHTML).toBe("");
  });
});

import type * as PageTree from "fumadocs-core/page-tree";
import { describe, expect, it } from "vitest";
import { activeRootTab, rootTabs } from "./root-tabs";

const docsTab: PageTree.Folder = {
  $id: "docs",
  type: "folder",
  name: "Docs",
  root: true,
  children: [
    { type: "page", name: "Introduction", url: "/docs" },
    { type: "folder", name: "Guides", children: [{ type: "page", name: "CI", url: "/docs/ci" }] },
  ],
};

const referenceTab: PageTree.Folder = {
  $id: "reference",
  type: "folder",
  name: "Reference",
  root: true,
  children: [
    { type: "page", name: "Tools", url: "/docs/cli/mcp#tools" },
    {
      type: "folder",
      name: "CLI",
      index: { type: "page", name: "Overview", url: "/docs/cli" },
      children: [{ type: "page", name: "translate", url: "/docs/cli/translate" }],
    },
    { type: "page", name: "Releases", url: "https://example.com/releases", external: true },
  ],
};

const tabbed: PageTree.Root = { name: "Documentation", children: [docsTab, referenceTab] };

describe("rootTabs", () => {
  it("offers one tab per root folder, identified by that folder", () => {
    const tabs = rootTabs(tabbed);
    expect(tabs.map((tab) => tab.title)).toEqual(["Docs", "Reference"]);
    expect(tabs.map((tab) => tab.id)).toEqual(["docs", "reference"]);
  });

  it("opens each tab on its first real page, skipping anchor and external links", () => {
    expect(rootTabs(tabbed).map((tab) => tab.url)).toEqual(["/docs", "/docs/cli"]);
  });

  it("offers no tabs for a sidebar without root folders", () => {
    const flat: PageTree.Root = {
      name: "Documentation",
      children: [{ type: "page", name: "Introduction", url: "/docs" }],
    };
    expect(rootTabs(flat)).toEqual([]);
  });

  it("drops a root folder that holds no page to open or has no id", () => {
    const empty: PageTree.Folder = {
      $id: "e",
      type: "folder",
      name: "E",
      root: true,
      children: [],
    };
    const anonymous: PageTree.Folder = {
      type: "folder",
      name: "Anonymous",
      root: true,
      children: docsTab.children,
    };
    expect(rootTabs({ name: "Documentation", children: [empty, anonymous, docsTab] })).toEqual([
      { id: "docs", title: "Docs", url: "/docs" },
    ]);
  });
});

describe("activeRootTab", () => {
  const tabs = rootTabs(tabbed);

  it("is the tab of the root folder the current page sits in", () => {
    expect(activeRootTab(tabs, "reference")?.url).toBe("/docs/cli");
    expect(activeRootTab(tabs, "docs")?.url).toBe("/docs");
  });

  it("is none when the current page sits outside every tab", () => {
    expect(activeRootTab(tabs, "root")).toBeUndefined();
    expect(activeRootTab(tabs, undefined)).toBeUndefined();
  });
});

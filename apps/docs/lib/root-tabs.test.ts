import type * as PageTree from "fumadocs-core/page-tree";
import { describe, expect, it } from "vitest";
import { activeRootTab, headerActiveTab, isRootTabLinkActive, rootTabs } from "./root-tabs";

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

describe("isRootTabLinkActive", () => {
  const tabs = rootTabs(tabbed);
  const reference = activeRootTab(tabs, "reference");

  it("marks the link that opens the current tab active, whatever page of the tab is open", () => {
    expect(isRootTabLinkActive("/docs/cli", tabs, reference)).toBe(true);
    expect(isRootTabLinkActive("/docs", tabs, reference)).toBe(false);
  });

  it("marks no tab link active outside every tab", () => {
    expect(isRootTabLinkActive("/docs", tabs, undefined)).toBe(false);
  });

  it("leaves links that open no tab to their own matching", () => {
    expect(isRootTabLinkActive("/docs/start-with-ai", tabs, reference)).toBeUndefined();
  });
});

describe("headerActiveTab", () => {
  const tabs = rootTabs(tabbed);
  const docs = activeRootTab(tabs, "docs");
  const links = [
    { text: "Docs", url: "/docs" },
    { text: "Reference", url: "/docs/cli" },
    { text: "Start with AI", url: "/docs/start-with-ai" },
  ];

  it("keeps the current tab when no other header link matches the page", () => {
    expect(headerActiveTab(links, tabs, docs, () => false)).toBe(docs);
  });

  it("ignores a tab link's own exact match", () => {
    expect(
      headerActiveTab(links, tabs, docs, (item) => "url" in item && item.url === "/docs"),
    ).toBe(docs);
  });

  it("yields to a more specific header link, so only one header link is active", () => {
    const onStartWithAi = (item: (typeof links)[number] | object) =>
      "url" in item && item.url === "/docs/start-with-ai";
    expect(headerActiveTab(links, tabs, docs, onStartWithAi)).toBeUndefined();
  });
});

import type * as PageTree from "fumadocs-core/page-tree";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { rootTabs, withLlmsLinks } = await import("./docs-page-tree");

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

const flat: PageTree.Root = {
  name: "Documentation",
  children: [{ type: "page", name: "Introduction", url: "/docs" }],
};

describe("rootTabs", () => {
  it("offers one tab per root folder, bound to that folder", () => {
    const tabs = rootTabs(tabbed);
    expect(tabs.map((tab) => tab.title)).toEqual(["Docs", "Reference"]);
    expect(tabs.map((tab) => tab.$folder)).toEqual([docsTab, referenceTab]);
  });

  it("opens each tab on its first real page, skipping anchor and external links", () => {
    expect(rootTabs(tabbed).map((tab) => tab.url)).toEqual(["/docs", "/docs/cli"]);
  });

  it("offers no tabs for a sidebar without root folders", () => {
    expect(rootTabs(flat)).toEqual([]);
  });

  it("drops a root folder that holds no page to open", () => {
    const empty: PageTree.Folder = { type: "folder", name: "Empty", root: true, children: [] };
    expect(rootTabs({ name: "Documentation", children: [empty, docsTab] })).toHaveLength(1);
  });
});

describe("withLlmsLinks", () => {
  it("ends every tab with the llms.txt links, so both tabs show them", async () => {
    const tree = await withLlmsLinks(tabbed, "en");
    for (const node of tree.children) {
      if (node.type !== "folder") throw new Error("expected a root folder");
      expect(node.children.slice(-3).map((child) => child.name)).toEqual([
        "heading",
        "index",
        "full",
      ]);
    }
    expect(tree.children).toHaveLength(2);
  });

  it("ends a sidebar without root folders with the llms.txt links", async () => {
    const tree = await withLlmsLinks(flat, "en");
    expect(tree.children.map((child) => child.name)).toEqual([
      "Introduction",
      "heading",
      "index",
      "full",
    ]);
  });
});

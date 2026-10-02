// @vitest-environment jsdom

import type * as PageTree from "fumadocs-core/page-tree";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withGroupLabels } from "./docs-group-labels";

const child: PageTree.Item = { type: "page", name: "Your first translation", url: "/docs/first" };

const tree: PageTree.Root = {
  name: "Documentation",
  children: [
    { type: "page", name: "Introduction", url: "/docs" },
    { type: "folder", name: "Get started", children: [child] },
    {
      type: "folder",
      name: "Guides",
      children: [{ type: "separator", name: "Automate" }, child],
    },
    { type: "separator", name: "For AI agents" },
  ],
};

function markup(name: PageTree.Node["name"]): string {
  return renderToStaticMarkup(name);
}

describe("withGroupLabels", () => {
  it("wraps top-level folders and separators in the shared label class", () => {
    const labelled = withGroupLabels(tree);
    expect(markup(labelled.children[1]?.name)).toBe('<span class="vk-label">Get started</span>');
    expect(markup(labelled.children[2]?.name)).toBe('<span class="vk-label">Guides</span>');
    expect(markup(labelled.children[3]?.name)).toBe('<span class="vk-label">For AI agents</span>');
  });

  it("keeps a top-level page name as written", () => {
    const [introduction] = withGroupLabels(tree).children;
    expect(introduction).toBe(tree.children[0]);
    expect(introduction?.name).toBe("Introduction");
  });

  it("leaves nested pages untouched", () => {
    const folder = withGroupLabels(tree).children[1];
    expect(folder?.type).toBe("folder");
    if (folder?.type !== "folder") return;
    expect(folder.children[0]).toBe(child);
  });

  it("marks a separator inside a group as a subgroup label", () => {
    const folder = withGroupLabels(tree).children[2];
    if (folder?.type !== "folder") throw new Error("expected a folder");
    expect(markup(folder.children[0]?.name)).toBe('<span class="vk-sidebar-group">Automate</span>');
    expect(folder.children[1]).toBe(child);
  });

  it("labels the groups inside a root folder and keeps the tab name plain", () => {
    const tabbed: PageTree.Root = {
      name: "Documentation",
      children: [{ type: "folder", name: "Docs", root: true, children: tree.children }],
    };
    const [tab] = withGroupLabels(tabbed).children;
    if (tab?.type !== "folder") throw new Error("expected a root folder");
    expect(tab.name).toBe("Docs");
    expect(markup(tab.children[1]?.name)).toBe('<span class="vk-label">Get started</span>');
    const guides = tab.children[2];
    if (guides?.type !== "folder") throw new Error("expected a folder");
    expect(markup(guides.children[0]?.name)).toBe('<span class="vk-sidebar-group">Automate</span>');
  });

  it("does not mutate the source tree", () => {
    withGroupLabels(tree);
    expect(tree.children[1]?.name).toBe("Get started");
  });
});

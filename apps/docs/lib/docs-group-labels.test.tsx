// @vitest-environment jsdom

import type * as PageTree from "fumadocs-core/page-tree";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withGroupLabels } from "./docs-group-labels";

const child: PageTree.Item = { type: "page", name: "Your first translation", url: "/docs/first" };

const tree: PageTree.Root = {
  name: "Documentation",
  children: [
    { type: "page", name: "Introduction", url: "/docs" },
    { type: "folder", name: "Get started", children: [child] },
    { type: "separator", name: "For AI agents" },
  ],
};

function markup(name: PageTree.Node["name"]): string {
  return renderToStaticMarkup(name);
}

describe("withGroupLabels", () => {
  it("wraps every top-level name in the shared label class", () => {
    const labelled = withGroupLabels(tree);
    for (const node of labelled.children) {
      expect(isValidElement(node.name)).toBe(true);
      expect(markup(node.name)).toMatch(/^<span class="vk-label">.+<\/span>$/);
    }
    expect(markup(labelled.children[1]?.name)).toBe('<span class="vk-label">Get started</span>');
  });

  it("leaves nested pages untouched", () => {
    const folder = withGroupLabels(tree).children[1];
    expect(folder?.type).toBe("folder");
    if (folder?.type !== "folder") return;
    expect(folder.children[0]).toBe(child);
  });

  it("does not mutate the source tree", () => {
    withGroupLabels(tree);
    expect(tree.children[1]?.name).toBe("Get started");
  });
});

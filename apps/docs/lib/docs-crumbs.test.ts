import type * as PageTree from "fumadocs-core/page-tree";
import { describe, expect, it } from "vitest";
import { crumbTrail, pageGroup } from "./docs-crumbs";

const translate: PageTree.Item = { type: "page", name: "translate", url: "/docs/cli/translate" };
const errorCodes: PageTree.Item = { type: "page", name: "Error codes", url: "/docs/error-codes" };
const cli: PageTree.Folder = { type: "folder", name: "CLI", children: [translate] };
const reference: PageTree.Folder = {
  type: "folder",
  name: "Reference",
  root: true,
  children: [cli, errorCodes],
};
const tree: PageTree.Root = { name: "Reference", children: [reference] };

describe("pageGroup", () => {
  it("names the sidebar group a page sits in", () => {
    expect(pageGroup(tree, [reference, cli, translate])).toBe("CLI");
  });

  it("falls back to the tab for a page that sits directly under it", () => {
    expect(pageGroup(tree, [reference, errorCodes])).toBe("Reference");
  });

  it("names nothing for a page outside every tree", () => {
    expect(pageGroup({ name: "", children: [] }, [])).toBeUndefined();
  });
});

describe("crumbTrail", () => {
  it("runs from the tab through the group to the page", () => {
    expect(crumbTrail(tree, [reference, cli, translate]).map((crumb) => crumb.name)).toEqual([
      "Reference",
      "CLI",
      "translate",
    ]);
  });
});

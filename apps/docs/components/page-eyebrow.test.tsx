// @vitest-environment jsdom

import type * as PageTree from "fumadocs-core/page-tree";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const translate: PageTree.Item = { type: "page", name: "translate", url: "/docs/cli/translate" };
const cli: PageTree.Folder = { type: "folder", name: "CLI", children: [translate] };
const reference: PageTree.Folder = {
  type: "folder",
  name: "Reference",
  root: true,
  children: [cli],
};
const state = vi.hoisted(() => ({ path: [] as ReadonlyArray<unknown> }));

vi.mock("fumadocs-ui/contexts/tree", () => ({
  useTreeContext: () => ({ root: { name: "Reference", children: [reference] } }),
  useTreePath: () => state.path,
}));

const { PageEyebrow } = await import("./page-eyebrow");
const { DocsCrumbBar } = await import("./docs-crumb-bar");

describe("PageEyebrow", () => {
  it("prints the sidebar group of the page as a label", () => {
    state.path = [reference, cli, translate];
    const markup = renderToStaticMarkup(<PageEyebrow />);
    expect(markup).toContain('class="vk-page-eyebrow vk-label"');
    expect(markup).toContain(">CLI<");
  });

  it("prints nothing when the page has no tree path", () => {
    state.path = [];
    expect(renderToStaticMarkup(<PageEyebrow />)).toBe("");
  });
});

describe("DocsCrumbBar", () => {
  it("shows the trail, marks the page and keeps the trigger first", () => {
    state.path = [reference, cli, translate];
    const markup = renderToStaticMarkup(
      <DocsCrumbBar>
        <button type="button">menu</button>
      </DocsCrumbBar>,
    );
    expect(markup.indexOf("<button")).toBeLessThan(markup.indexOf("vk-crumbs"));
    expect(markup).toContain("Reference");
    expect(markup).toContain("CLI");
    expect(markup).toMatch(/aria-current="page"[^>]*>translate</);
  });
});

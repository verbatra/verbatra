import type * as PageTree from "fumadocs-core/page-tree";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageEyebrow } from "./page-eyebrow";

const translate: PageTree.Item = { type: "page", name: "translate", url: "/docs/cli/translate" };
const errorCodes: PageTree.Item = { type: "page", name: "Error codes", url: "/docs/error-codes" };
const tree: PageTree.Root = {
  name: "Docs",
  children: [
    {
      type: "folder",
      name: "Reference",
      root: true,
      children: [{ type: "folder", name: "CLI", children: [translate] }, errorCodes],
    },
  ],
};

describe("PageEyebrow", () => {
  it("prints the tab and the sidebar group of the page as one label", () => {
    const markup = renderToStaticMarkup(<PageEyebrow tree={tree} url={translate.url} />);
    expect(markup).toBe('<p class="vk-page-eyebrow vk-label">Reference / CLI</p>');
  });

  it("falls back to the tab for a page directly under it", () => {
    expect(renderToStaticMarkup(<PageEyebrow tree={tree} url={errorCodes.url} />)).toContain(
      ">Reference<",
    );
  });

  it("prints nothing for a url outside the tree", () => {
    expect(renderToStaticMarkup(<PageEyebrow tree={tree} url="/docs/missing" />)).toBe("");
  });
});

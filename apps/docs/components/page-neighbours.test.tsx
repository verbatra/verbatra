import type * as PageTree from "fumadocs-core/page-tree";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const page = (name: string): PageTree.Item => ({
  type: "page",
  name,
  url: `/docs/${name.toLowerCase()}`,
});
const tree = vi.hoisted(() => ({ value: { name: "Docs", children: [] } as PageTree.Root }));

vi.mock("@/lib/source", () => ({ source: { getPageTree: () => tree.value } }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
}));

const { PageNeighbours } = await import("./page-neighbours");

async function render(url: string): Promise<string> {
  return renderToStaticMarkup(await PageNeighbours({ locale: "en", url }));
}

describe("PageNeighbours", () => {
  it("links the previous and the next page under direction labels", async () => {
    tree.value = { name: "Docs", children: [page("One"), page("Two"), page("Three")] };
    const markup = await render("/docs/two");
    expect(markup).toContain('aria-label="t:label"');
    expect(markup).toMatch(/rel="prev"[^>]*>.*t:previous.*One/);
    expect(markup).toMatch(/rel="next"[^>]*data-direction="next"[^>]*>.*t:next.*Three/);
  });

  it("renders only the next link on the first page", async () => {
    tree.value = { name: "Docs", children: [page("One"), page("Two")] };
    const markup = await render("/docs/one");
    expect(markup).not.toContain('rel="prev"');
    expect(markup).toContain('rel="next"');
  });

  it("renders nothing for a page with no neighbour", async () => {
    tree.value = { name: "Docs", children: [page("One")] };
    expect(await render("/docs/one")).toBe("");
  });
});

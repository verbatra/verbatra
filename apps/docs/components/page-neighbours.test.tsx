import type { Item } from "fumadocs-core/page-tree";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getTranslations = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({ getTranslations }));
getTranslations.mockImplementation(async () => (key: string) => `t:${key}`);

const { PageNeighbours } = await import("./page-neighbours");

const page = (name: string): Item => ({ type: "page", name, url: `/docs/${name.toLowerCase()}` });

async function render(props: { previous?: Item; next?: Item }, locale = "en"): Promise<string> {
  return renderToStaticMarkup(await PageNeighbours({ locale: locale as "en", ...props }));
}

describe("PageNeighbours", () => {
  it("reads the nav label from the docs.pagination namespace", async () => {
    await render({ next: page("Two") });
    expect(getTranslations).toHaveBeenCalledWith({ locale: "en", namespace: "docs.pagination" });
  });

  it("links the previous and the next page under the Fumadocs direction labels", async () => {
    const markup = await render({ previous: page("One"), next: page("Three") });
    expect(markup).toContain('aria-label="t:label"');
    expect(markup).toMatch(/rel="prev"[^>]*>.*Previous Page.*One/);
    expect(markup).toMatch(/rel="next"[^>]*data-direction="next"[^>]*>.*Next Page.*Three/);
  });

  it("localizes the direction labels from the Fumadocs table", async () => {
    const markup = await render({ previous: page("One"), next: page("Three") }, "de");
    expect(markup).toContain("Vorherige Seite");
    expect(markup).toContain("Nächste Seite");
  });

  it("renders only the next link on the first page", async () => {
    const markup = await render({ next: page("Two") });
    expect(markup).not.toContain('rel="prev"');
    expect(markup).toContain('rel="next"');
  });

  it("renders nothing for a page with no neighbour", async () => {
    expect(await render({})).toBe("");
  });
});

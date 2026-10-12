// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/project-stats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/project-stats")>()),
  loadProjectStats: async () => ({ stars: 4321, weeklyDownloads: null }),
}));
vi.mock("@/components/site-header", async () => {
  const { useHomeNav } = await import("@/components/home-nav");
  return {
    HomeSiteHeader: () => <header data-stars={useHomeNav().stars}>site header</header>,
  };
});
vi.mock("@/lib/layout.shared", () => ({
  baseOptions: async () => ({}),
}));

const { LocaleHomeLayout, MAIN_CONTENT_ID } = await import("@/lib/locale-home-layout");

async function renderLayout(): Promise<Document> {
  const element = await LocaleHomeLayout({
    params: Promise.resolve({ lang: "en" }),
    children: <p>page body</p>,
    footer: <footer>site footer</footer>,
  });
  return new DOMParser().parseFromString(renderToStaticMarkup(element), "text/html");
}

describe("LocaleHomeLayout: landmarks", () => {
  it("renders one main that holds the page and nothing else", async () => {
    const doc = await renderLayout();
    const mains = doc.querySelectorAll("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]?.id).toBe(MAIN_CONTENT_ID);
    expect(mains[0]?.textContent).toBe("page body");
  });

  it("keeps the header and footer outside main, so they stay banner and contentinfo", async () => {
    const doc = await renderLayout();
    expect(doc.querySelector("header")?.closest("main")).toBeNull();
    expect(doc.querySelector("footer")?.closest("main")).toBeNull();
    expect(doc.querySelector("header")?.closest("article, aside, nav, section")).toBeNull();
    expect(doc.querySelector("footer")?.closest("article, aside, nav, section")).toBeNull();
  });

  it("keeps the id fumadocs scopes its home layout variables to", async () => {
    const doc = await renderLayout();
    expect(doc.getElementById("nd-home-layout")?.tagName).toBe("DIV");
  });
});

describe("LocaleHomeLayout: the landing nav", () => {
  it("fetches the star count on the server and hands it to the header, compacted", async () => {
    const doc = await renderLayout();
    expect(doc.querySelector("header")?.getAttribute("data-stars")).toBe("4.3K");
  });
});

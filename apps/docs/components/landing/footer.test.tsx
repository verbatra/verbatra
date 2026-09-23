// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CONTRIBUTORS } from "@/lib/contributors";

const localeState = vi.hoisted(() => ({ current: "en" }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    values?.name ?? key,
  getLocale: async () => localeState.current,
}));

const { FullFooter } = await import("./footer");

async function renderFooter(): Promise<Document> {
  const markup = renderToStaticMarkup(await FullFooter());
  return new DOMParser().parseFromString(markup, "text/html");
}

function imageUrls(doc: Document): string[] {
  return Array.from(doc.querySelectorAll("img")).flatMap((img) => {
    const srcset = (img.getAttribute("srcset") ?? "")
      .split(",")
      .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
      .filter((url) => url.length > 0);
    return [img.getAttribute("src") ?? "", ...srcset];
  });
}

describe("FullFooter", () => {
  it("renders one avatar per committed contributor", async () => {
    const doc = await renderFooter();

    for (const contributor of CONTRIBUTORS) {
      expect(doc.querySelector(`img[alt="${contributor.login}"]`)).not.toBeNull();
    }
  });

  it.each([
    ["en", ""],
    ["de", "/de"],
    ["es", "/es"],
    ["fr", "/fr"],
  ])("keeps the %s reader's locale in the legal links", async (locale, prefix) => {
    localeState.current = locale;
    try {
      const doc = await renderFooter();
      for (const key of ["privacy", "imprint", "contact"]) {
        const link = doc.querySelector(`a[href$="/${key}"]`);
        expect(link?.getAttribute("href")).toBe(`${prefix}/${key}`);
        expect(link?.textContent).toBe(`cols.legal.${key}`);
      }
    } finally {
      localeState.current = "en";
    }
  });

  it.each([
    ["en", ""],
    ["de", "/de"],
    ["es", "/es"],
    ["fr", "/fr"],
  ])("keeps the %s reader's locale in the docs links", async (locale, prefix) => {
    localeState.current = locale;
    try {
      const doc = await renderFooter();
      const hrefs = Array.from(doc.querySelectorAll("a"))
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/"));
      const docsLinks = hrefs.filter((href) => /^\/([a-z]{2}\/)?docs(\/|$)/.test(href));

      expect(docsLinks.length).toBe(11);
      for (const href of docsLinks) {
        expect(href.startsWith(`${prefix}/docs`)).toBe(true);
      }
      expect(hrefs).toEqual(
        expect.arrayContaining(["/llms.txt", "/llms-full.txt", "/.well-known/ai.txt"]),
      );
    } finally {
      localeState.current = "en";
    }
  });

  it("never points an image at a third-party host", async () => {
    const urls = imageUrls(await renderFooter());

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^\/(?!\/)/);
      expect(new URL(url, "https://verbatra.test").host).toBe("verbatra.test");
    }
  });
});

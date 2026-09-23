// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CONTRIBUTORS } from "@/lib/contributors";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    values?.name ?? key,
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

  it("never points an image at a third-party host", async () => {
    const urls = imageUrls(await renderFooter());

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^\/(?!\/)/);
      expect(new URL(url, "https://verbatra.test").host).toBe("verbatra.test");
    }
  });
});

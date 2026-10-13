// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import { CONTRIBUTORS } from "@/lib/contributors";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const { Contributors, OpenSource, OPEN_SOURCE_LINKS } = await import("./open-source");

const copy = en.landing.openSource;

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await OpenSource());
});

describe("OpenSource", () => {
  it("starts the contributors on column 9, under the split lead", () => {
    const people = root
      .querySelector("#open-source-contributors")
      ?.closest("section")?.parentElement;
    expect(people?.getAttribute("style")).toContain("--grid-start:9");
    expect(people?.getAttribute("style")).toContain("--grid-span:4");
  });

  it("opens on the open source heading and lead", () => {
    expect(root.querySelector("h2")?.textContent).toBe(copy.heading);
    expect(root.textContent).toContain(copy.lead);
  });

  it("links the repository, license, contributor guide, code of conduct, security policy, issues, roadmap and releases", () => {
    const hrefs = Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "https://github.com/verbatra/verbatra",
        "https://github.com/verbatra/verbatra/blob/main/LICENSE",
        "https://github.com/verbatra/verbatra/blob/main/CONTRIBUTING.md",
        "https://github.com/verbatra/verbatra/blob/main/CODE_OF_CONDUCT.md",
        "https://github.com/verbatra/verbatra/blob/main/SECURITY.md",
        "https://github.com/verbatra/verbatra/issues",
        "https://github.com/verbatra/verbatra/issues?q=is%3Aissue%20is%3Aopen%20label%3Aenhancement",
        "https://github.com/verbatra/verbatra/releases",
      ]),
    );
    for (const link of OPEN_SOURCE_LINKS) {
      const anchor = root.querySelector(`a[href='${link.href}']`);
      expect(anchor?.textContent).toBe(`${copy[link.key as keyof typeof copy]} ${copy.newTab}`);
      expect(anchor?.getAttribute("rel")).toBe("noreferrer noopener");
    }
  });

  it("marks every project row as a link that opens a new tab, with a hidden icon and a spoken note", () => {
    const rows = [GITHUB_URL, ...OPEN_SOURCE_LINKS.map((link) => link.href)].map((href) =>
      root.querySelector<HTMLAnchorElement>(`a[href='${href}']`),
    );
    expect(rows).toHaveLength(OPEN_SOURCE_LINKS.length + 1);
    for (const row of rows) {
      if (!row) throw new Error("project row missing");
      expect(row.getAttribute("target")).toBe("_blank");
      expect(row.querySelector("svg[data-external]")?.getAttribute("aria-hidden")).toBe("true");
      expect(row.querySelector(".sr-only")?.textContent?.trim()).toBe(copy.newTab);
      expect(row.textContent).not.toMatch(/[\u2190-\u21FF\u2197]/);
    }
  });

  it("says a row opens a new tab in every locale", () => {
    for (const catalog of [en, de, es, fr]) {
      expect(catalog.landing.openSource.newTab).toMatch(/^\(.+\)$/);
    }
  });

  it("renders one fixed-size local avatar per committed contributor", () => {
    expect(CONTRIBUTORS.length).toBeGreaterThan(0);
    for (const contributor of CONTRIBUTORS) {
      const image = root.querySelector(`img[alt="${contributor.login} on GitHub"]`);
      expect(image).not.toBeNull();
      expect(image?.getAttribute("width")).toBe("40");
      expect(image?.getAttribute("height")).toBe("40");
      expect(image?.closest("a")?.getAttribute("href")).toBe(contributor.profileUrl);
    }
    for (const image of root.querySelectorAll("img")) {
      const src = image.getAttribute("src") ?? "";
      expect(new URL(src, "https://verbatra.test").host).toBe("verbatra.test");
    }
  });

  it("drops the contributors block when there is nobody to show", () => {
    expect(
      renderToStaticMarkup(<Contributors contributors={[]} title="t" ariaFor={(login) => login} />),
    ).toBe("");
  });
});

describe("license and release labels", () => {
  it.each([
    ["en", en],
    ["de", de],
    ["es", es],
    ["fr", fr],
  ] as const)(
    "name the license and the release notes the same way here and in the footer (%s)",
    (_locale, messages) => {
      const { footer, openSource } = messages.landing;
      expect(footer.cols.legal.license).toBe(openSource.license);
      expect(footer.cols.community.releases).toBe(openSource.releases);
    },
  );

  it("writes the English license label in sentence case", () => {
    expect(en.landing.openSource.license).toBe("MIT license");
    expect(en.landing.footer.legalLicense).toContain("MIT license");
  });
});

// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CONTRIBUTORS } from "@/lib/contributors";

const localeState = vi.hoisted(() => ({ current: "en" }));

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => (key: string, values?: Record<string, string>) =>
    namespace === "docs.statusBadges" ? `badge:${key}` : (values?.name ?? key),
  getLocale: async () => localeState.current,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/compare" }));

const { FOOTER_GROUPS, FullFooter } = await import("./footer");

async function renderFooter(): Promise<Document> {
  const markup = renderToStaticMarkup(await FullFooter());
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("FullFooter", () => {
  it("labels the license link from the messages, not a hard-coded English name", async () => {
    const doc = await renderFooter();
    const license = doc.querySelector(
      'a[href="https://github.com/verbatra/verbatra/blob/main/LICENSE"]',
    );
    expect(license?.textContent).toBe("cols.legal.license");
  });

  it("leaves the contributors to the open source section", async () => {
    const doc = await renderFooter();

    expect(doc.querySelectorAll("img")).toHaveLength(0);
    for (const contributor of CONTRIBUTORS) {
      expect(doc.querySelector(`a[href="${contributor.profileUrl}"]`)).toBeNull();
    }
  });

  it("draws no background pattern and no wordmark watermark", async () => {
    const doc = await renderFooter();
    const footer = doc.querySelector("footer");
    const decorations = Array.from(footer?.querySelectorAll('[aria-hidden="true"]') ?? []).filter(
      (node) => node.closest("a") === null && node.tagName !== "svg",
    );
    expect(decorations.map((node) => node.getAttribute("style") ?? "").join(" ")).not.toMatch(
      /background-size|mask-image/,
    );
    const wordmarks = Array.from(footer?.querySelectorAll("span") ?? []).filter(
      (span) => span.children.length === 0 && span.textContent?.trim() === "verbatra",
    );
    expect(wordmarks).toHaveLength(1);
    const source = readFileSync(join(process.cwd(), "components/landing/footer.tsx"), "utf8");
    expect(source).not.toContain("GRID_PATTERN");
  });

  it("reads no retired or dark-only token, so it follows both themes", () => {
    const source = readFileSync(join(process.cwd(), "components/landing/footer.tsx"), "utf8");

    for (const token of ["--v-pink", "--gradient-headline", "--v-void", "--v-glow"]) {
      expect(source).not.toContain(token);
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
      for (const key of ["privacy", "imprint", "contact", "licenses"]) {
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

  it("carries the contributor guide, the CLI on npm and the contact page the header leaves out", async () => {
    const doc = await renderFooter();
    const hrefs = Array.from(doc.querySelectorAll("a")).map((link) => link.getAttribute("href"));

    expect(hrefs).toEqual(
      expect.arrayContaining([
        "https://github.com/verbatra/verbatra/blob/main/CONTRIBUTING.md",
        "https://www.npmjs.com/package/@verbatra/cli",
        "/contact",
      ]),
    );
  });

  it("sits on a flat band under one hairline, with no gradient wash or gradient rule", async () => {
    const doc = await renderFooter();
    const footer = doc.querySelector("footer");
    expect(footer?.className).toBe("vk-footer");
    expect(footer?.getAttribute("style")).toBeNull();
    const source = readFileSync(join(process.cwd(), "components/landing/footer.tsx"), "utf8");
    expect(source).not.toContain("gradient");
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    const start = css.indexOf("\n.vk-footer {");
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("background: var(--surface-band);");
    expect(rule).toContain("border-top: 1px solid var(--border-default);");
  });

  it.each([
    ["en", ""],
    ["de", "/de"],
  ])(
    "links the changelog, the npm org, every package and the %s comparison page",
    async (locale, prefix) => {
      localeState.current = locale;
      try {
        const doc = await renderFooter();
        const hrefs = Array.from(doc.querySelectorAll("a")).map((link) =>
          link.getAttribute("href"),
        );
        expect(hrefs).toEqual(
          expect.arrayContaining([
            "https://github.com/verbatra/verbatra",
            "https://github.com/verbatra/verbatra/releases",
            "https://www.npmjs.com/org/verbatra",
            "https://www.npmjs.com/package/@verbatra/cli",
            "https://www.npmjs.com/package/@verbatra/sdk",
            "https://www.npmjs.com/package/@verbatra/studio",
            "https://www.npmjs.com/package/@verbatra/mcp",
            `${prefix}/compare`,
          ]),
        );
      } finally {
        localeState.current = "en";
      }
    },
  );

  it("leaves the NEW status to the docs sidebar and draws no status pill in a footer link", async () => {
    const doc = await renderFooter();

    expect(doc.querySelectorAll("nav a > span")).toHaveLength(0);
    expect(doc.querySelector(".vk-pill-status")).toBeNull();
    expect(doc.body.textContent).not.toContain("badge:new");
  });

  it("titles each link column in sentence-case sans type, not as an all-caps mono label", async () => {
    const doc = await renderFooter();
    const titles = Array.from(doc.querySelectorAll("nav > p"));

    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title.className).not.toMatch(/\b(uppercase|font-mono|vk-label)\b/);
    }
  });

  it("closes with the version line, the license and the copyright, without a separator glyph", async () => {
    const doc = await renderFooter();
    const line = doc.querySelector(".vk-footer-bottom .vk-footer-meta");

    expect(Array.from(line?.children ?? []).map((span) => span.textContent)).toEqual([
      "versionParts",
      "legalLicense",
      "legalCopyright",
    ]);
    expect(line?.textContent).not.toContain("\u00b7");
  });

  it("merges the links into four groups, the docs group first and widest", async () => {
    const doc = await renderFooter();
    const groups = Array.from(doc.querySelectorAll<HTMLElement>(".vk-footer-groups > nav"));
    expect(groups.map((group) => group.dataset.group)).toEqual([
      "product",
      "packages",
      "community",
      "legal",
    ]);
    expect(groups.map((group) => group.querySelectorAll("a").length)).toEqual(
      FOOTER_GROUPS.map((group) => group.links.length),
    );
    expect(doc.querySelector(".vk-footer-top")?.textContent).toContain("tagline");
  });

  it("ends in a no-JS locale switch to the current page", async () => {
    localeState.current = "de";
    try {
      const doc = await renderFooter();
      const links = Array.from(doc.querySelectorAll(".vk-footer-bottom .vk-locale-links a"));
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/compare",
        "/de/compare",
        "/es/compare",
        "/fr/compare",
      ]);
      expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([
        null,
        "page",
        null,
        null,
      ]);
      expect(doc.querySelector(".vk-locale-links-label")?.textContent).toBe("language");
    } finally {
      localeState.current = "en";
    }
  });
});

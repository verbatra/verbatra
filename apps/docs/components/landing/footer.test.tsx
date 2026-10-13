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

const { FullFooter } = await import("./footer");

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

  it("labels the new badges through the translated status string", async () => {
    const doc = await renderFooter();
    const badges = Array.from(doc.querySelectorAll("nav a > span")).map((span) => span.textContent);

    expect(badges.length).toBeGreaterThan(0);
    expect(new Set(badges)).toEqual(new Set(["badge:new"]));
  });

  it("sets the license and the copyright apart without a separator glyph", async () => {
    const doc = await renderFooter();
    const license = Array.from(doc.querySelectorAll("span")).find(
      (span) => span.textContent === "legalLicense",
    );
    const line = license?.parentElement;

    expect(Array.from(line?.children ?? []).map((span) => span.textContent)).toEqual([
      "legalLicense",
      "legalCopyright",
    ]);
    expect(line?.textContent).not.toContain("\u00b7");
  });
});

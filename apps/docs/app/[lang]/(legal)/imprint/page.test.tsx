// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../messages");

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({
      locale,
      messages: JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")),
      namespace: namespace as never,
    }),
}));

const { default: ImprintPage } = await import("./page");

describe("imprint page: contact form link", () => {
  it.each([
    ["en", "/contact"],
    ["de", "/de/contact"],
    ["es", "/es/contact"],
    ["fr", "/fr/contact"],
  ])("keeps the %s reader's locale", async (lang, href) => {
    const page = await ImprintPage({ params: Promise.resolve({ lang }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
    const links = Array.from(doc.querySelectorAll("a"))
      .map((link) => link.getAttribute("href"))
      .filter((value) => value?.endsWith("/contact"));

    expect(links).toEqual([href]);
  });
});

describe("imprint page: provider details", () => {
  it("names the provider under a neutral heading in one block with name, address and email", async () => {
    const page = await ImprintPage({ params: Promise.resolve({ lang: "de" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
    const headings = Array.from(doc.querySelectorAll("h2"), (node) => node.textContent);
    const details = doc.querySelector("h2")?.nextElementSibling?.textContent ?? "";

    expect(headings).toEqual(["Angaben zum Anbieter", "Lizenz"]);
    expect(details).toContain("Mario Kreitz");
    expect(details).toContain("Mönchfeldstraße 7");
    expect(details).toContain("70378 Stuttgart");
    expect(details).toContain("Deutschland");
    expect(details).toContain("info@kreitz-webdev.de");
  });

  it("renders no VAT ID, business ID or trade line while those details are unanswered", async () => {
    const page = await ImprintPage({ params: Promise.resolve({ lang: "de" }) });
    const text = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html").body
      .textContent;

    expect(text).not.toMatch(/USt-Id|Umsatzsteuer|Wirtschafts-Id|Gewerbe|Handelsregister/i);
  });
});

describe("imprint page: license", () => {
  it.each([
    ["en", "/licenses"],
    ["de", "/de/licenses"],
    ["es", "/es/licenses"],
    ["fr", "/fr/licenses"],
  ])(
    "puts code, docs and screenshots under MIT and links the third-party notices for %s readers",
    async (lang, licensesHref) => {
      const page = await ImprintPage({ params: Promise.resolve({ lang }) });
      const doc = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
      const text = doc.body.textContent?.replace(/\s+/g, " ") ?? "";
      const links = Array.from(doc.querySelectorAll("a"));
      const license = links.find((link) => link.textContent === "MIT-Lizenz");
      const notices = links.find((link) => link.textContent === "Lizenzhinweise");

      expect(text).toContain(
        "verbatra (Quellcode, Dokumentation und Screenshots) steht unter der MIT-Lizenz.",
      );
      expect(text).toContain(
        "Schriftarten, Icons und Bibliotheken Dritter behalten ihre eigenen Lizenzen",
      );
      expect(license?.getAttribute("href")).toBe(
        "https://github.com/verbatra/verbatra/blob/main/LICENSE",
      );
      expect(notices?.getAttribute("href")).toBe(licensesHref);
    },
  );
});

describe("imprint page: legal basis", () => {
  it.each(["en", "de", "es", "fr"])(
    "cites section 18 paragraph 1 MStV once, right after the provider details, for %s readers",
    async (lang) => {
      const page = await ImprintPage({ params: Promise.resolve({ lang }) });
      const doc = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
      const details = doc.querySelector("h2")?.nextElementSibling;
      const basis = details?.nextElementSibling;

      expect(basis?.textContent).toBe("Anbieterkennzeichnung nach § 18 Abs. 1 MStV");
      expect(doc.body.textContent?.match(/§\s*18\s*Abs\.\s*1\s*MStV/g)).toHaveLength(1);
    },
  );

  it("keeps the heading neutral and names neither section 5 DDG nor section 18 paragraph 2 MStV", async () => {
    const page = await ImprintPage({ params: Promise.resolve({ lang: "de" }) });
    const text = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html").body
      .textContent;

    expect(text).not.toMatch(/§\s*5\s*DDG|§\s*18\s*Abs\.\s*2|Verantwortlich für den Inhalt/);
    expect(text).not.toContain("Angaben gemäß");
  });
});

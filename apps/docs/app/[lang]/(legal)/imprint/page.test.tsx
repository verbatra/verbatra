// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../messages");

vi.mock("next-intl/server", () => ({
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

describe("imprint page: non-commercial provider details", () => {
  it("names the provider under § 18 Abs. 1 MStV in one block with name, address and email", async () => {
    const page = await ImprintPage({ params: Promise.resolve({ lang: "de" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
    const headings = Array.from(doc.querySelectorAll("h2"), (node) => node.textContent);
    const details = doc.querySelector("h2")?.nextElementSibling?.textContent ?? "";

    expect(headings).toEqual(["Angaben gemäß § 18 Abs. 1 MStV", "Hinweis", "Lizenz"]);
    expect(details).toContain("Mario Kreitz");
    expect(details).toContain("70378 Stuttgart");
    expect(details).toContain("info@kreitz-webdev.de");
  });
});

describe("imprint page: non-commercial notice and license", () => {
  it.each(["en", "de", "es", "fr"])(
    "states the non-commercial basis and links the MIT license for %s readers",
    async (lang) => {
      const page = await ImprintPage({ params: Promise.resolve({ lang }) });
      const doc = new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
      const text = doc.body.textContent?.replace(/\s+/g, " ") ?? "";
      const license = Array.from(doc.querySelectorAll("a")).find(
        (link) => link.textContent === "MIT-Lizenz",
      );

      expect(text).toContain(
        "Diese Website ist die Dokumentation des nicht-kommerziellen Open-Source-Projekts verbatra.",
      );
      expect(text).toContain("Es werden keine Waren oder Dienstleistungen gegen Entgelt angeboten");
      expect(text).toContain("Der Quellcode von verbatra steht unter der MIT-Lizenz.");
      expect(license?.getAttribute("href")).toBe(
        "https://github.com/verbatra/verbatra/blob/main/LICENSE",
      );
    },
  );
});

// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/lib/licenses.generated.json";

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

const { default: LicensesPage, generateMetadata } = await import("./page");

async function render(lang: string): Promise<Document> {
  const page = await LicensesPage({ params: Promise.resolve({ lang }) });
  return new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
}

describe("licenses page", () => {
  it.each([
    ["en", "Licenses"],
    ["de", "Lizenzen"],
    ["es", "Licencias"],
    ["fr", "Licences"],
  ])("localizes only the heading and intro for %s readers", async (lang, title) => {
    const doc = await render(lang);
    expect(doc.querySelector("h1")?.textContent).toBe(title);
    expect((await generateMetadata({ params: Promise.resolve({ lang }) })).title).toBe(title);
    const english = doc.querySelector('[lang="en"]');
    expect(english).not.toBeNull();
    expect(english?.querySelector("h2")?.textContent).toBe("Fonts and other assets");
    expect(doc.querySelector("article > p")?.textContent?.length).toBeGreaterThan(40);
  });

  it("opens one section per license group, then every package with its version", async () => {
    const doc = await render("en");
    const headings = [...doc.querySelectorAll("h2")].map((node) => node.textContent);
    expect(headings.slice(1)).toEqual(
      manifest.groups.map(
        (group) =>
          `${group.license} (${group.packages.length} ${group.packages.length === 1 ? "package" : "packages"})`,
      ),
    );
    const codes = [...doc.querySelectorAll("li > code")].map((node) => node.textContent);
    expect(codes).toHaveLength(manifest.packageCount);
    expect(codes).toContain("next@16.3.8");
  });

  it("prints every distinct license text once, each reachable by its anchor", async () => {
    const doc = await render("de");
    const ids = [...doc.querySelectorAll("details[id]")].map((node) => node.id);
    expect(ids.sort()).toEqual(manifest.texts.map((text) => text.id).sort());
    for (const link of doc.querySelectorAll('a[href^="#text-"]')) {
      expect(ids).toContain(link.getAttribute("href")?.slice(1));
    }
    expect(doc.body.textContent).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it("prints the LGPL text the deployed libvips binary falls back to, inside its license group", async () => {
    const doc = await render("en");
    const section = [...doc.querySelectorAll("section")].find((node) =>
      node.querySelector("h2")?.textContent?.startsWith("LGPL-3.0-or-later"),
    );
    const codes = [...(section?.querySelectorAll("li > code") ?? [])].map(
      (node) => node.textContent,
    );
    expect(codes.some((code) => code?.startsWith("@img/sharp-libvips-linux-x64@"))).toBe(true);
    expect(section?.textContent).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
    expect(section?.textContent).toContain("GNU GENERAL PUBLIC LICENSE");
  });
});

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import { MACHINE_PROVIDER_IDS } from "./landing-facts";
import {
  FAQ_ANSWER_LINKS,
  FAQ_ASIDE_LINKS,
  faqHref,
  faqValues,
  pendingProviders,
  publishedProviders,
} from "./landing-faq";
import { PLAYGROUND_METADATA } from "./landing-playground";
import { providerShortLabel } from "./landing-providers";
import { RELEASE_BADGE, versionAtLeast } from "./release-badge";

describe("versionAtLeast", () => {
  it.each([
    ["0.12.0", "0.12.0", true],
    ["0.12.1", "0.12.0", true],
    ["1.0.0", "0.12.0", true],
    ["0.11.1", "0.12.0", false],
    ["0.9.9", "0.10.0", false],
  ])("%s at least %s is %s", (version, minimum, expected) => {
    expect(versionAtLeast(version, minimum)).toBe(expected);
  });
});

describe("the providers on npm", () => {
  it("leaves out the providers the next release adds while an older release is published", () => {
    const before = "0.11.1";
    expect(publishedProviders(before)).toEqual(
      MACHINE_PROVIDER_IDS.filter((id) => !RELEASE_BADGE.providers.includes(id)),
    );
    expect(pendingProviders(before)).toEqual([...RELEASE_BADGE.providers]);
    const values = faqValues("npm", "en", before);
    expect(values.pending).toBe("yes");
    expect(values.next).toBe(RELEASE_BADGE.version);
    for (const id of RELEASE_BADGE.providers) {
      expect(values.providers).not.toContain(providerShortLabel(id));
      expect(values.upcoming).toContain(providerShortLabel(id));
    }
  });

  it("names every provider once the badged release is published", () => {
    expect(publishedProviders(RELEASE_BADGE.version)).toEqual([...MACHINE_PROVIDER_IDS]);
    expect(pendingProviders(RELEASE_BADGE.version)).toEqual([]);
    expect(faqValues("npm", "en", RELEASE_BADGE.version).pending).toBe("no");
  });

  it("joins the names with the reader's list conjunction", () => {
    expect(faqValues("npm", "de", "0.11.1").providers).toContain(" und ");
    expect(faqValues("npm", "fr", "0.11.1").providers).toContain(" et ");
  });
});

describe("the playground answer", () => {
  it("names the provider the committed results record", () => {
    expect(faqValues("playground", "en").provider.toLowerCase()).toBe(PLAYGROUND_METADATA.provider);
  });
});

const DOCS_ROOT = fileURLToPath(new URL("../content/docs/", import.meta.url));

function isLocaleFile(file: string, locale: string): boolean {
  if (locale !== i18n.defaultLanguage) return file.endsWith(`.${locale}.mdx`);
  return file.endsWith(".mdx") && !/\.(?:de|es|fr)\.mdx$/.test(file);
}

function docsUrls(locale: string): ReadonlySet<string> {
  const suffix = locale === i18n.defaultLanguage ? ".mdx" : `.${locale}.mdx`;
  return new Set(
    readdirSync(DOCS_ROOT, { recursive: true, encoding: "utf8" })
      .filter((file) => isLocaleFile(file, locale))
      .map((file) =>
        `/docs/${file.slice(0, -suffix.length)}`
          .replace(/\([^)]+\)\//g, "")
          .replace(/\/index$/, ""),
      ),
  );
}

describe("the faq links", () => {
  const pages = [
    ...Object.values(FAQ_ANSWER_LINKS),
    ...FAQ_ASIDE_LINKS.map(({ link }) => link),
  ].filter((link) => link.page.startsWith("/docs/"));

  it.each(i18n.languages)("point at docs pages that exist in %s", (locale) => {
    const urls = docsUrls(locale);
    for (const link of pages) expect(urls.has(link.page), link.page).toBe(true);
  });

  it("prefix every non-default locale and keep the default one bare", () => {
    for (const link of pages) {
      expect(faqHref("en", link).startsWith("/docs/")).toBe(true);
      expect(faqHref("fr", link).startsWith("/fr/docs/")).toBe(true);
    }
  });
});

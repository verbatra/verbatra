import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";

type MessageTree = { [key: string]: string | MessageTree };

function load(locale: string): MessageTree {
  const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as MessageTree;
}

function leafKeys(tree: MessageTree, prefix: string): ReadonlyArray<string> {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : leafKeys(value, path);
  });
}

function landingKeys(locale: string): ReadonlyArray<string> {
  const landing = load(locale).landing;
  if (typeof landing !== "object") throw new Error(`no landing namespace in ${locale}.json`);
  return leafKeys(landing, "landing").toSorted();
}

function landingText(locale: string, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (tree, key) =>
        typeof tree === "object" && tree !== null ? (tree as MessageTree)[key] : undefined,
      load(locale).landing,
    );
  if (typeof value !== "string") throw new Error(`no landing.${path} in ${locale}.json`);
  return value;
}

const EM_DASH = String.fromCharCode(0x2014);

describe("landing message parity", () => {
  const source = landingKeys(i18n.defaultLanguage);

  it("covers every namespace the redesigned landing reads", () => {
    for (const key of [
      "landing.nav.skipToContent",
      "landing.topNav.label",
      "landing.banner.headline",
      "landing.banner.keysAdded",
      "landing.footer.versionParts",
      "landing.steps.items.ci.title",
      "landing.marquee.heading",
      "landing.marquee.pause",
      "landing.playground.label",
      "landing.playground.languageNames.ja",
      "landing.compare.rows.license.verbatra",
      "landing.statement.heading",
      "landing.highlights.agents.body",
      "landing.features.items.doctor.title",
      "landing.openSource.contributorsHeading",
      "landing.closing.heading",
      "landing.closing.label",
      "landing.fab.label",
    ]) {
      expect(source).toContain(key);
    }
  });

  it.each([
    "gains",
    "providers",
    "proof",
    "gate",
    "how",
    "ecosystem",
    "control",
    "loop",
    "terminal",
    "finalClose",
    "hero.headline",
    "hero.ledger",
    "hero.facts",
    "hero.og",
    "hero.demo",
    "nav.sections",
    "nav.headerCta",
    "footer.contributorsTitle",
    "footer.contributorAria",
    "showcase.tabs",
    "formats",
    "banner.exitCode",
    "code",
    "stats",
    "problem",
    "steps.heading",
    "steps.lead",
    "showcase.heading",
    "showcase.lead",
    "studio",
    "flow",
    "bento",
    "facts",
    "showcase.tryIt.scenarios",
    "showcase.tryIt.result",
    "showcase",
  ])("keeps no landing.%s message from a retired section", (path) => {
    for (const locale of i18n.languages) {
      expect(() => landingText(locale, path), locale).toThrow();
      expect(
        landingKeys(locale).some((key) => key.startsWith(`landing.${path}.`)),
        locale,
      ).toBe(false);
    }
  });

  for (const locale of i18n.languages.filter((lang) => lang !== i18n.defaultLanguage)) {
    it(`${locale} holds exactly the source keys`, () => {
      expect(landingKeys(locale)).toEqual(source);
    });
  }

  it("gives the hero a lead that says something the headline does not", () => {
    for (const locale of i18n.languages) {
      const headline = landingText(locale, "banner.headline").replace(/\.$/, "");
      expect(landingText(locale, "banner.lead"), locale).not.toContain(headline);
    }
  });

  it("keeps the home title between 50 and 60 characters in every locale", () => {
    for (const locale of i18n.languages) {
      const length = landingText(locale, "meta.title").length;
      expect(length, locale).toBeGreaterThanOrEqual(50);
      expect(length, locale).toBeLessThanOrEqual(60);
    }
  });

  it("names the entity Verbatra at the start of the home title and definition in every locale", () => {
    for (const locale of i18n.languages) {
      expect(landingText(locale, "meta.title"), locale).toMatch(/^Verbatra\b/);
      expect(landingText(locale, "meta.definition"), locale).toMatch(/^Verbatra\b/);
    }
  });

  it("keeps the home meta description between 150 and 160 characters in every locale", () => {
    for (const locale of i18n.languages) {
      const length = landingText(locale, "meta.description").length;
      expect(length, locale).toBeGreaterThanOrEqual(150);
      expect(length, locale).toBeLessThanOrEqual(160);
    }
  });

  it("spells open source without a hyphen everywhere in the English landing copy", () => {
    for (const key of landingKeys(i18n.defaultLanguage)) {
      expect(landingText("en", key.replace(/^landing\./, "")), key).not.toMatch(/open-source/i);
    }
  });

  it("ends no landing headline with a period", () => {
    for (const locale of i18n.languages) {
      for (const path of [
        "banner.headline",
        "marquee.heading",
        "statement.heading",
        "highlights.heading",
        "playground.heading",
        "features.heading",
        "faq.heading",
        "closing.heading",
      ]) {
        expect(landingText(locale, path), `${locale} ${path}`).not.toMatch(/\.$/);
      }
    }
  });

  it("carries no em dash in any locale", () => {
    for (const locale of i18n.languages) {
      const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
      expect(readFileSync(path, "utf8")).not.toContain(EM_DASH);
    }
  });

  it("never breaks the closing heading at a hyphen", () => {
    for (const locale of i18n.languages) {
      expect(landingText(locale, "closing.heading"), locale).not.toContain("-");
    }
  });

  it("words an absence in the comparison as a search that found nothing, never as a missing feature", () => {
    for (const locale of i18n.languages) {
      expect(landingText(locale, "compare.rows.ci.tolgee"), locale).toMatch(
        /found|gefunden|encontr|trouvée/,
      );
    }
  });
});

describe("French landing typography", () => {
  it("elides with the typographic apostrophe, which the display and body fonts draw alike", () => {
    const strings: string[] = [];
    const collect = (node: unknown): void => {
      if (typeof node === "string") strings.push(node);
      else if (node && typeof node === "object")
        for (const value of Object.values(node)) collect(value);
    };
    collect(load("fr").landing);
    expect(strings.filter((text) => /\p{L}'\p{L}/u.test(text))).toEqual([]);
    expect(strings.some((text) => text.includes("’"))).toBe(true);
  });
});

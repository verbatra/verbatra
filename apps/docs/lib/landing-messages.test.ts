import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SPACELESS_SNIPPET_WIDTH, snippetLength } from "@/lib/display-width";
import { i18n, type Locale } from "@/lib/i18n";
import { countWords } from "@/lib/word-count";

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

interface LengthWindow {
  readonly min: number;
  readonly max: number;
}

const SEARCH_TITLE_WINDOW: LengthWindow = { min: 50, max: 60 };
const SEARCH_DESCRIPTION_WINDOW: LengthWindow = { min: 150, max: 160 };

const CJK_TITLE_WINDOW: LengthWindow = { min: 30, max: SPACELESS_SNIPPET_WIDTH.titleMax };
const CJK_DESCRIPTION_WINDOW: LengthWindow = {
  min: 100,
  max: SPACELESS_SNIPPET_WIDTH.descriptionMax,
};

const TITLE_WINDOWS: Readonly<Record<Locale, LengthWindow>> = {
  en: SEARCH_TITLE_WINDOW,
  de: SEARCH_TITLE_WINDOW,
  es: SEARCH_TITLE_WINDOW,
  fr: SEARCH_TITLE_WINDOW,
  "zh-CN": CJK_TITLE_WINDOW,
  "pt-BR": SEARCH_TITLE_WINDOW,
  ja: CJK_TITLE_WINDOW,
};

const DESCRIPTION_WINDOWS: Readonly<Record<Locale, LengthWindow>> = {
  en: SEARCH_DESCRIPTION_WINDOW,
  de: SEARCH_DESCRIPTION_WINDOW,
  es: SEARCH_DESCRIPTION_WINDOW,
  fr: SEARCH_DESCRIPTION_WINDOW,
  "zh-CN": CJK_DESCRIPTION_WINDOW,
  "pt-BR": SEARCH_DESCRIPTION_WINDOW,
  ja: CJK_DESCRIPTION_WINDOW,
};

const STATEMENT_WORD_CAP: Readonly<Record<Locale, number>> = {
  en: 8,
  de: 8,
  es: 8,
  fr: 8,
  "zh-CN": 10,
  "pt-BR": 8,
  ja: 12,
};

const EYEBROW_WORD_CAP: Readonly<Record<Locale, number>> = {
  en: 4,
  de: 4,
  es: 4,
  fr: 4,
  "zh-CN": 4,
  "pt-BR": 4,
  ja: 4,
};

describe("landing message parity", () => {
  const source = landingKeys(i18n.defaultLanguage);

  it("covers every namespace the redesigned landing reads", () => {
    for (const key of [
      "landing.nav.skipToContent",
      "landing.topNav.label",
      "landing.banner.headline",
      "landing.banner.keysChanged",
      "landing.footer.versionParts",
      "landing.steps.items.ci.title",
      "landing.marquee.heading",
      "landing.marquee.pause",
      "landing.lockDemo.label",
      "landing.lockDemo.badge.changed",
      "landing.comparison.heading",
      "landing.comparison.verdicts.yes",
      "landing.lockDemo.heading",
      "landing.gate.heading",
      "landing.highlights.surfaces.mcp",
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
    "compare",
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

  it("keeps the statement band to its word cap and to one sentence per beat, in every locale", () => {
    for (const locale of i18n.languages) {
      const text = landingText(locale, "statement.text");
      expect(countWords(text, locale), locale).toBeLessThanOrEqual(STATEMENT_WORD_CAP[locale]);
      expect(text, locale).not.toMatch(/\n/);
    }
  });

  it("labels every content section with a short eyebrow that does not repeat its heading, in every locale", () => {
    const sections = ["lockDemo", "features", "highlights", "comparison", "faq"];
    for (const locale of i18n.languages) {
      for (const section of sections) {
        const label = landingText(locale, `${section}.label`);
        const heading = section === "lockDemo" ? label : landingText(locale, `${section}.heading`);
        expect(countWords(label, locale), `${locale} ${section}`).toBeLessThanOrEqual(
          EYEBROW_WORD_CAP[locale],
        );
        expect(label.length, `${locale} ${section}`).toBeGreaterThan(0);
        if (section !== "lockDemo") expect(heading, `${locale} ${section}`).not.toContain(label);
      }
    }
  });

  it("gives the hero a lead that says something the headline does not", () => {
    for (const locale of i18n.languages) {
      const headline = landingText(locale, "banner.headline").replace(/\.$/, "");
      expect(landingText(locale, "banner.lead"), locale).not.toContain(headline);
    }
  });

  it("has the closing lead say the path needs no API key and starts from existing locale files", () => {
    const lead = landingText("en", "closing.lead");
    expect(lead).toMatch(/already has locale files/);
    expect(lead).toMatch(/API key/);
    expect(lead).not.toMatch(/After init/);
  });

  it("keeps the home title inside its length window in every locale", () => {
    for (const locale of i18n.languages) {
      const length = snippetLength(locale, landingText(locale, "meta.title"));
      expect(length, locale).toBeGreaterThanOrEqual(TITLE_WINDOWS[locale].min);
      expect(length, locale).toBeLessThanOrEqual(TITLE_WINDOWS[locale].max);
    }
  });

  it("names the entity Verbatra at the start of the home title and definition in every locale", () => {
    for (const locale of i18n.languages) {
      expect(landingText(locale, "meta.title"), locale).toMatch(/^Verbatra\b/);
      expect(landingText(locale, "meta.definition"), locale).toMatch(/^Verbatra\b/);
    }
  });

  it("keeps the home meta description inside its length window in every locale", () => {
    for (const locale of i18n.languages) {
      const length = snippetLength(locale, landingText(locale, "meta.description"));
      expect(length, locale).toBeGreaterThanOrEqual(DESCRIPTION_WINDOWS[locale].min);
      expect(length, locale).toBeLessThanOrEqual(DESCRIPTION_WINDOWS[locale].max);
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
        "lockDemo.heading",
        "gate.heading",
        "highlights.heading",
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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";

const LANDING_NAMESPACES = [
  "hero",
  "showcase",
  "terminal",
  "install",
  "nav",
  "footer",
  "finalClose",
  "how",
  "formats",
  "marquee",
  "loop",
  "control",
] as const;

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
  return LANDING_NAMESPACES.flatMap((namespace) => {
    const tree = landing[namespace];
    if (typeof tree !== "object") throw new Error(`no landing.${namespace} in ${locale}.json`);
    return leafKeys(tree, `landing.${namespace}`);
  }).toSorted();
}

type HeroCopy = { headline: string; lead: string; dogfood: string };

function heroCopy(locale: string): HeroCopy {
  const landing = load(locale).landing;
  const hero = typeof landing === "object" ? landing.hero : undefined;
  if (typeof hero !== "object") throw new Error(`no landing.hero in ${locale}.json`);
  const text = (key: keyof HeroCopy) => {
    const value = hero[key];
    if (typeof value !== "string") throw new Error(`no landing.hero.${key} in ${locale}.json`);
    return value;
  };
  return { headline: text("headline"), lead: text("lead"), dogfood: text("dogfood") };
}

const EM_DASH = String.fromCharCode(0x2014);
const NON_BREAKING_HYPHEN = String.fromCharCode(0x2011);

describe("landing message parity", () => {
  const source = landingKeys(i18n.defaultLanguage);

  it("covers every namespace the landing chrome reads", () => {
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain("landing.nav.skipToContent");
    expect(source).toContain("landing.terminal.sessionLabel");
    expect(source).toContain("landing.loop.rows.sdk.title");
    expect(source).toContain("landing.loop.rows.handoff.title");
    expect(source).toContain("landing.marquee.frameworks.reactNative");
    expect(source).toContain("landing.formats.frameworksLabel");
    expect(source).toContain("landing.loop.rows.studio.alt");
    expect(source).toContain("landing.control.groups.correct.items.terms.title");
    expect(source).toContain("landing.control.groups.people.items.protect.title");
    expect(source).toContain("landing.showcase.tryIt.result.summary");
  });

  it("keeps no messages for the removed gains, providers, How panels or hero demo", () => {
    for (const locale of i18n.languages) {
      const landing = load(locale).landing;
      expect(typeof landing === "object" && "gains" in landing, locale).toBe(false);
      expect(typeof landing === "object" && "providers" in landing, locale).toBe(false);
      expect(typeof landing === "object" && "proof" in landing, locale).toBe(false);
      expect(typeof landing === "object" && "gate" in landing, locale).toBe(false);
      const hero = typeof landing === "object" ? landing.hero : undefined;
      expect(typeof hero === "object" && "demo" in hero, locale).toBe(false);
    }
  });

  it.each([
    "marquee.providers",
    "marquee.providersLabel",
    "showcase.tabs",
    "showcase.tablist",
    "showcase.studio",
    "loop.rows.ci",
    "loop.rows.excel",
  ])(
    "keeps no landing.%s message from the removed marquee providers row, showcase tabs or loop rows",
    (path) => {
      for (const locale of i18n.languages) {
        const node = path
          .split(".")
          .reduce<unknown>(
            (tree, key) =>
              typeof tree === "object" && tree !== null ? (tree as MessageTree)[key] : undefined,
            load(locale).landing,
          );
        expect(node, locale).toBeUndefined();
      }
    },
  );

  for (const locale of i18n.languages.filter((lang) => lang !== i18n.defaultLanguage)) {
    it(`${locale} holds exactly the source keys`, () => {
      expect(landingKeys(locale)).toEqual(source);
    });
  }

  it("claims only the interface strings for verbatra in the hero caption, since the MDX pages are agent-written", () => {
    const interfaceStrings: Record<string, RegExp> = {
      en: /^This site's interface strings in German, Spanish and French come from verbatra\.$/,
      de: /^Die Oberflächentexte dieser Seite /,
      es: /^Los textos de la interfaz de este sitio /,
      fr: /^Les textes de l'interface de ce site /,
    };
    for (const locale of i18n.languages) {
      const hero = heroCopy(locale);
      expect(hero.dogfood, locale).toMatch(interfaceStrings[locale] ?? /^$/);
    }
  });

  it("gives the hero a lead that says something the headline does not", () => {
    for (const locale of i18n.languages) {
      const hero = heroCopy(locale);
      expect(hero.lead, locale).not.toContain(hero.headline.replace(/\.$/, ""));
      expect(hero.lead, locale).not.toMatch(
        /only new or changed|nur neue oder geänderte|solo las claves nuevas|que les clés nouvelles/,
      );
    }
    expect(heroCopy("en").lead).toMatch(/lock file decides which keys changed/);
    expect(heroCopy("en").lead).toMatch(
      /checked for intact placeholders before verbatra writes it/,
    );
    expect(heroCopy("fr").lead).toContain("versionné");
    expect(heroCopy("es").lead).toContain("versionado en el repositorio");
  });

  it("carries no em dash in any locale", () => {
    for (const locale of i18n.languages) {
      const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
      expect(readFileSync(path, "utf8")).not.toContain(EM_DASH);
    }
  });

  it("keeps hyphenated words in the closing heading on one line", () => {
    for (const locale of i18n.languages) {
      const finalClose = load(locale).landing;
      const heading =
        typeof finalClose === "object" && typeof finalClose.finalClose === "object"
          ? finalClose.finalClose.heading
          : undefined;
      expect(typeof heading, locale).toBe("string");
      expect(heading, locale).not.toContain("-");
      if (locale === i18n.defaultLanguage) expect(heading).toContain(NON_BREAKING_HYPHEN);
    }
  });
});

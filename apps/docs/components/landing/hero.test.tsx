// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { releaseUrl } from "@/components/landing/links";
import { HERO_INSTALL_COMMAND } from "@/lib/install-commands";
import { HERO_FILE_ADDED_COUNT } from "@/lib/landing-hero-files";
import { PLAYGROUND_FILES_PATTERN, PLAYGROUND_TRANSLATIONS } from "@/lib/landing-playground";
import { PACKAGE_VERSION } from "@/lib/site";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import messages from "@/messages/en.json";
import { stripAccentTags } from "@/test-support/accent-tags";
import { preloadRegisteredIslands } from "@/test-support/islands";

const page = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { readFileSync: read } = await import("node:fs");
  const { join: joinPath } = await import("node:path");
  return {
    getTranslations: async (scope: string | { namespace: string }) =>
      createTranslator({
        locale: page.locale,
        messages: JSON.parse(read(joinPath(process.cwd(), `messages/${page.locale}.json`), "utf8")),
        namespace: (typeof scope === "string" ? scope : scope.namespace) as never,
      }),
    getLocale: async () => page.locale,
  };
});

const { Hero, HERO_TITLE_ID } = await import("./hero");

await preloadRegisteredIslands();

function catalogFor(locale: string): typeof messages {
  return JSON.parse(readFileSync(join(process.cwd(), `messages/${locale}.json`), "utf8"));
}

async function render(locale = "en"): Promise<Document> {
  page.locale = locale;
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={catalogFor(locale)}>
      {await Hero()}
    </NextIntlClientProvider>,
  );
  return new DOMParser().parseFromString(html, "text/html");
}

const banner = messages.landing.banner;
const headlinePlain = stripAccentTags(banner.headline);
const headlineLit = /<accent>(.*)<\/accent>/.exec(banner.headline)?.[1];
const install = messages.landing.install;
const newTab = messages.landing.openSource.newTab;

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

describe("Hero copy", () => {
  it("names its section by the one h1, the headline, under the subline", async () => {
    const doc = await render();
    const h1s = doc.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(headlinePlain);
    expect(h1s[0]?.id).toBe(HERO_TITLE_ID);
    expect(doc.querySelector("section")?.getAttribute("aria-labelledby")).toBe(HERO_TITLE_ID);
    expect(h1s[0]?.nextElementSibling?.textContent).toBe(banner.lead);
  });

  it("keeps the headline to eight words and the subline to twenty-five, with no two-beat slogan", () => {
    expect(words(headlinePlain)).toBeLessThanOrEqual(8);
    expect(words(banner.lead)).toBeLessThanOrEqual(25);
    expect(headlinePlain.split(/[.!?]\s/)).toHaveLength(1);
  });

  it("sets the gradient on the second line of the headline only, the first staying solid", async () => {
    const h1 = (await render()).querySelector("h1");
    const lit = h1?.querySelectorAll(".vk-banner-title-lit");
    expect(lit).toHaveLength(1);
    expect(lit?.[0]?.textContent).toBe(headlineLit);
    expect(lit?.[0]?.tagName).toBe("SPAN");
    expect(h1?.firstChild?.textContent).toBe(headlinePlain.replace(headlineLit ?? "", ""));
  });

  it("opens the copy with the new-release announcement, linking the current release notes in a new tab", async () => {
    const copy = (await render()).querySelector(".vk-banner-copy");
    const announce = copy?.firstElementChild;
    expect(announce?.tagName).toBe("A");
    expect(announce?.className).toBe("vk-announce");
    expect(announce?.getAttribute("href")).toBe(releaseUrl(PACKAGE_VERSION));
    expect(announce?.getAttribute("target")).toBe("_blank");
    expect(announce?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(announce?.querySelector(".vk-pill-new")?.textContent).toBe(banner.announcement.badge);
    expect(announce?.querySelector(".vk-announce-text")?.textContent).toBe(
      banner.announcement.text.replace("{version}", PACKAGE_VERSION),
    );
    expect(announce?.querySelector(".sr-only")?.textContent).toBe(` ${newTab}`);
    expect(announce?.nextElementSibling?.tagName).toBe("H1");
  });

  it.each(["en", "de", "es", "fr"])(
    "names the release in the %s announcement without repeating the pill's word",
    (locale) => {
      const catalog = JSON.parse(source(`messages/${locale}.json`)) as typeof messages;
      const { badge, text } = catalog.landing.banner.announcement;
      expect(text).toContain("{version}");
      expect(text.toLocaleLowerCase(locale)).not.toContain(badge.toLocaleLowerCase(locale));
    },
  );

  it("keeps the pill's ring, shimmer and chevron away from assistive technology", async () => {
    const announce = (await render()).querySelector(".vk-announce");
    for (const part of announce?.querySelectorAll(
      ".vk-pill-new-ring, .vk-pill-new-shimmer, .vk-announce-chevron",
    ) ?? []) {
      expect(part.getAttribute("aria-hidden")).toBe("true");
    }
    expect(announce?.querySelectorAll("[aria-hidden='true']")).toHaveLength(3);
  });

  it("offers Get started to the quickstart beside an install command chip, and no GitHub button or trust line", async () => {
    const doc = await render();
    const ctas = doc.querySelector(".vk-banner-ctas");
    const links = Array.from(ctas?.querySelectorAll("a") ?? []);
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      [banner.ctaPrimary, "/docs/quickstart"],
    ]);
    expect(ctas?.firstElementChild).toBe(links[0]);
    expect(ctas?.lastElementChild?.className).toBe("vk-banner-install");
    expect(doc.querySelector(".vk-banner-trust, dl, .vk-facts")).toBeNull();
    expect(doc.querySelector(".vk-banner a[target='_blank']:not(.vk-announce)")).toBeNull();
  });

  it("prefixes the quickstart link with a non-default locale and renders its own catalog", async () => {
    const german = await render("de");
    expect(german.querySelector(".vk-banner-ctas a")?.getAttribute("href")).toBe(
      "/de/docs/quickstart",
    );
    const de = catalogFor("de").landing.banner;
    expect(german.querySelector(".vk-banner-ctas a")?.textContent).toBe(de.ctaPrimary);
    expect(german.querySelector(".vk-banner-lead")?.textContent).toBe(de.lead);
  });
});

describe("Hero install chip", () => {
  it("shows the short install command with one copy button that carries the localized label", async () => {
    const chip = (await render()).querySelector(".vk-banner-install");
    expect(HERO_INSTALL_COMMAND).toBe("npm i -D @verbatra/cli");
    expect(chip?.querySelector("code")?.textContent).toBe(HERO_INSTALL_COMMAND);
    const buttons = chip?.querySelectorAll("button") ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute("aria-label")).toBe(install.copyAria);
  });
});

describe("Hero locale files", () => {
  async function files(): Promise<Element> {
    const element = (await render()).querySelector(".vk-banner-demo > .vk-banner-files");
    if (element === null) throw new Error("no locale files");
    return element;
  }

  it("is decorative: hidden from assistive technology, with no island, tab or timer", async () => {
    const doc = await render();
    expect((await files()).getAttribute("aria-hidden")).toBe("true");
    expect(
      doc.querySelector(".vk-banner [role='tablist'], .vk-tracks, .vk-track-terminal"),
    ).toBeNull();
    expect(doc.querySelector(".vk-banner-demo")?.children).toHaveLength(1);
  });

  it("tints every placeholder in the locale files with the shared chip", async () => {
    const tinted = Array.from((await files()).querySelectorAll(".vk-banner-file .vk-ph")).map(
      (chip) => chip.textContent,
    );
    expect(tinted).toContain("{name}");
    expect(tinted).toContain("{count}");
    expect(tinted.every((text) => /^\{[^{}]+\}$/.test(text ?? ""))).toBe(true);
  });

  it("stacks fr, es and de, the front card last", async () => {
    const cards = Array.from((await files()).querySelectorAll(".vk-banner-file"));
    expect(cards.map((card) => card.getAttribute("data-locale"))).toEqual(["fr", "es", "de"]);
    expect(cards.map((card) => card.getAttribute("data-front"))).toEqual([null, null, "true"]);
  });

  it("names every card after the playground file pattern and fills it from the committed translations", async () => {
    const cards = Array.from((await files()).querySelectorAll(".vk-banner-file"));
    for (const card of cards) {
      const locale = card.getAttribute("data-locale") ?? "";
      expect(card.querySelector(".vk-banner-file-name")?.textContent).toContain(
        PLAYGROUND_FILES_PATTERN.replace("{locale}", locale),
      );
      for (const line of card.querySelectorAll(".vk-banner-file-line")) {
        const [, id = "", value = ""] =
          /^(?:\+ )?"([^"]+)": (".*"),?$/.exec(line.textContent ?? "") ?? [];
        expect(JSON.parse(value), `${locale} ${id}`).toBe(PLAYGROUND_TRANSLATIONS[locale]?.[id]);
      }
    }
    expect(cards[0]?.querySelectorAll(".vk-banner-file-line")).toHaveLength(1);
  });

  it("gives the de card five lines whose last new ones are marked with a plus, counted by the badge from the added lines", async () => {
    const front = (await files()).querySelector("[data-front='true']");
    const lines = Array.from(front?.querySelectorAll(".vk-banner-file-line") ?? []);
    expect(lines).toHaveLength(5);
    const added = lines.filter((line) => line.getAttribute("data-added") === "true");
    expect(added).toHaveLength(HERO_FILE_ADDED_COUNT);
    expect(added.every((line) => line.textContent?.startsWith("+ "))).toBe(true);
    expect(
      lines
        .filter((line) => !added.includes(line))
        .some((line) => line.textContent?.startsWith("+")),
    ).toBe(false);
    expect(front?.querySelector(".vk-banner-file-badge")?.textContent).toBe(
      banner.keysAdded.replace(
        /\{count, plural, one \{# key\} other \{# keys\}\}/,
        `${HERO_FILE_ADDED_COUNT} keys`,
      ),
    );
    expect(lines.at(-1)?.textContent?.endsWith(",")).toBe(false);
  });

  it("carries each card's language on its lines", async () => {
    const cards = Array.from((await files()).querySelectorAll(".vk-banner-file"));
    for (const card of cards) {
      const locale = card.getAttribute("data-locale");
      expect(card.querySelector(`[lang='${locale}']`)).not.toBeNull();
    }
  });
});

describe("Hero without an island", () => {
  it("keeps GSAP and any island but the install chip out of the hero", () => {
    expect(source("components/landing/hero.tsx")).not.toMatch(
      /from "(gsap|@gsap\/react|@\/lib\/gsap[^"]*)"|HeroTracks|landing-tracks/,
    );
    expect(existsSync(join(process.cwd(), "components/landing/hero-tracks.tsx"))).toBe(false);
  });
});

const BACK_CARDS_MEDIA = "@media (min-width: 64rem) @container (min-width: 28rem)";

describe("Hero stylesheet", () => {
  it("draws one decorative halo behind the whole hero, first in the section", async () => {
    const halo = (await render()).querySelector("section.vk-banner")?.firstElementChild;
    expect(halo?.className).toBe("vk-banner-halo");
    expect(halo?.getAttribute("aria-hidden")).toBe("true");
    expect(halo?.textContent).toBe("");
  });

  it("paints the halo from the halo tokens", () => {
    const halo = rulesFor(docsStylesheetRules(), ".vk-banner-halo");
    const base = halo.find((rule) => rule.media === "");
    expect(base?.declarations.background).toMatch(
      /^radial-gradient\(28rem 22rem at 50% 100%, var\(--halo-soft\)/,
    );
    expect(base?.declarations["pointer-events"]).toBe("none");
    expect(
      halo.find((rule) => rule.media === "@media (min-width: 64rem)")?.declarations.background,
    ).toMatch(/var\(--halo-strong\)[\s\S]*var\(--halo-soft\)/);
  });

  it("draws the header hairline as one plain border-token line, never a gradient", () => {
    const rules = docsStylesheetRules().filter((rule) => rule.selector === ".vk-header::after");
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.declarations.background).toBe("var(--border-default)");
      expect(rule.declarations.height).toBe("1px");
    }
  });

  it("puts the copy beside the narrower files column from 64rem, wide enough for the headline", () => {
    const rule = docsStylesheetRules().find(
      (entry) =>
        entry.selector === ".vk-banner-grid" &&
        entry.declarations["grid-template-columns"] === "minmax(0, 6fr) minmax(0, 5fr)",
    );
    expect(rule?.media).toContain("64rem");
  });

  it("shows only the front card below 64rem and rotates the back cards from 64rem, never fading text with opacity", () => {
    const rules = docsStylesheetRules();
    const wide = (locale: string) =>
      rulesFor(rules, `.vk-banner-file[data-locale="${locale}"]`).find(
        (rule) => rule.media === BACK_CARDS_MEDIA && "transform" in rule.declarations,
      )?.declarations.transform;
    expect(wide("fr")).toBe("rotate(-4deg)");
    expect(wide("es")).toBe("rotate(-1.5deg)");
    const hidden = rules.find(
      (rule) =>
        rule.media === "" &&
        rule.selector.includes('.vk-banner-file[data-locale="fr"]') &&
        rule.declarations.display === "none",
    );
    expect(hidden).toBeDefined();
    const own = rules.filter((rule) => rule.selector.startsWith(".vk-banner-file"));
    expect(own.some((rule) => "opacity" in rule.declarations)).toBe(false);
  });

  it("wraps every value line instead of truncating it, and shows the back cards only where their line fits", () => {
    const rules = docsStylesheetRules();
    const line = rulesFor(rules, ".vk-banner-file-line").find((rule) => rule.media === "");
    expect(line?.declarations["text-overflow"]).toBeUndefined();
    expect(line?.declarations["white-space"]).toBeUndefined();
    expect(line?.declarations["overflow-wrap"]).toBe("break-word");
    const backCards = rules.find(
      (rule) =>
        rule.media === BACK_CARDS_MEDIA &&
        rule.selector.includes('.vk-banner-file[data-locale="fr"]') &&
        rule.declarations.display === "block",
    );
    expect(backCards).toBeDefined();
    expect(
      rulesFor(rules, ".vk-banner-demo").find((rule) => rule.media === "")?.declarations[
        "container-type"
      ],
    ).toBe("inline-size");
  });

  it("keeps the old stack, sheet and track rules out of the stylesheet", () => {
    const selectors = docsStylesheetRules().map((rule) => rule.selector);
    expect(
      selectors.filter((selector) =>
        /vk-banner-(stack|sheet|trust)|vk-tracks?\b|vk-track-/.test(selector),
      ),
    ).toEqual([]);
  });
});

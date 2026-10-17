// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@/lib/i18n";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { providerShortLabel } from "@/lib/landing-providers";
import { RELEASE_BADGE } from "@/lib/release-badge";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import german from "@/messages/de.json";
import messages from "@/messages/en.json";
import { contrast, themeTokens } from "@/test-support/contrast";
import { preloadRegisteredIslands } from "@/test-support/islands";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  const catalogs = {
    en: (await import("@/messages/en.json")).default,
    de: (await import("@/messages/de.json")).default,
    es: (await import("@/messages/es.json")).default,
    fr: (await import("@/messages/fr.json")).default,
  };
  return {
    getTranslations: async (scope: string | { namespace: string }) =>
      createTranslator({
        locale: page.locale,
        messages: catalogs[page.locale as keyof typeof catalogs],
        namespace: (typeof scope === "string" ? scope : scope.namespace) as never,
      }),
    getLocale: async () => page.locale,
  };
});

const { Marquee, MARQUEE_COPIES } = await import("./marquee");
const { MarqueeMotion } = await import("./marquee-motion");

await preloadRegisteredIslands();

const copy = messages.landing.marquee;

async function render(locale = "en"): Promise<Document> {
  page.locale = locale;
  const html = renderToStaticMarkup(await Marquee());
  return new DOMParser().parseFromString(html, "text/html");
}

function row(doc: Document, id: string): Element {
  const found = doc.querySelector(`[data-row="${id}"]`);
  if (found === null) throw new Error(`no ${id} row`);
  return found;
}

function visibleItems(rowElement: Element): ReadonlyArray<string> {
  return Array.from(
    rowElement.querySelectorAll(".vk-marquee-list:not(.vk-marquee-copy) > li"),
    (item) => item.getAttribute("data-item") ?? "",
  );
}

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

function mountToggle(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() =>
    root.render(
      <MarqueeMotion pauseLabel={copy.pause}>
        <p>rows</p>
      </MarqueeMotion>,
    ),
  );
  return host;
}

const SPELLED_COUNTS: Readonly<Record<Locale, { numbers: string; nouns: string }>> = {
  en: {
    numbers:
      "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty",
    nouns: "providers?|formats?",
  },
  de: {
    numbers:
      "ein|eine|einen|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig",
    nouns: "providern?|anbietern?|formaten?|dateiformaten?",
  },
  es: {
    numbers:
      "un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciséis|diecisiete|dieciocho|diecinueve|veinte",
    nouns: "proveedor(?:es)?|formatos?",
  },
  fr: {
    numbers:
      "un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt",
    nouns: "fournisseurs?|formats?",
  },
};

function spelledCount(locale: Locale): RegExp {
  const { numbers, nouns } = SPELLED_COUNTS[locale];
  return new RegExp(
    `(?<![\\p{L}-])(?:\\d+|${numbers})\\s+(?:[\\p{L}-]+\\s+)?(?:${nouns})(?![\\p{L}-])`,
    "iu",
  );
}

describe("Marquee", () => {
  it("opens on its own heading and sits in the band with the marquee id", async () => {
    const doc = await render();
    const section = doc.querySelector("section#marquee");
    expect(section?.className).toBe("vk-band");
    expect(section?.querySelector("h2")?.textContent).toBe(copy.heading);
    expect(section?.querySelectorAll("h3")).toHaveLength(2);
  });

  it("lists every machine provider from the registry, in order, by its short label", async () => {
    const providers = row(await render(), "providers");
    expect(visibleItems(providers)).toEqual([...MACHINE_PROVIDER_IDS]);
    const labels = Array.from(
      providers.querySelectorAll(".vk-marquee-list:not(.vk-marquee-copy) > li > .vk-marquee-name"),
      (span) => span.textContent,
    );
    expect(labels).toEqual(MACHINE_PROVIDER_IDS.map(providerShortLabel));
  });

  it("lists every supported format from the registry, in order, by its display label", async () => {
    const formats = row(await render(), "formats");
    expect(visibleItems(formats)).toEqual([...SUPPORTED_FORMAT_IDS]);
    const names = Array.from(
      formats.querySelectorAll(".vk-marquee-list:not(.vk-marquee-copy) > li > .vk-marquee-name"),
      (span) => span.textContent,
    );
    expect(names).toEqual(SUPPORTED_FORMAT_IDS.map((id) => FORMAT_DISPLAY[id].label));
  });

  it("dates exactly the providers the release badge names, with the badge's version", async () => {
    const providers = row(await render(), "providers");
    const badged = Array.from(
      providers.querySelectorAll(".vk-marquee-list:not(.vk-marquee-copy) > li:has(.vk-pill-new)"),
      (item) => item.getAttribute("data-item"),
    );
    expect(badged).toEqual([...RELEASE_BADGE.providers]);
    const pill = providers.querySelector(".vk-pill-new");
    expect(pill?.textContent).toBe(
      `${copy.new} (${messages.docs.availableFrom.title.replace("{version}", RELEASE_BADGE.version)})`,
    );
    expect(pill?.querySelector(".sr-only")?.textContent).toContain(RELEASE_BADGE.version);
    expect(providers.querySelector(".vk-available-from")).toBeNull();
  });

  it.each([
    ["en", "verbatra speaks seven providers and reads 14 file formats."],
    ["de", "Sieben Provider und vierzehn Dateiformate."],
    ["es", "Siete proveedores y catorce formatos de archivo."],
    ["fr", "Sept fournisseurs et quatorze formats de fichier."],
  ] as const)("flags a spelled-out or numeric count in %s", (locale, sentence) => {
    expect(sentence).toMatch(spelledCount(locale));
  });

  it.each(["en", "de", "es", "fr"] as const)(
    "types no provider or format count, in digits or words, in %s",
    async (locale) => {
      const section = (await render(locale)).querySelector("section#marquee");
      expect(section?.textContent?.length).toBeGreaterThan(0);
      expect(section?.textContent).not.toMatch(spelledCount(locale));
    },
  );

  it("draws every item's mark from the page's own sprite: no image, no embed, no external reference", async () => {
    const section = (await render()).querySelector("section#marquee");
    const uses = Array.from(section?.querySelectorAll("use") ?? [], (use) =>
      use.getAttribute("href"),
    );
    expect(uses.length).toBeGreaterThan(0);
    for (const href of uses) expect(href).toMatch(/^#marquee-mark-[a-z0-9]+$/);
    expect(section?.querySelectorAll("img, image, picture, object, embed, iframe")).toHaveLength(0);
    for (const element of Array.from(section?.querySelectorAll("svg *") ?? [])) {
      expect(element.hasAttribute("xlink:href"), element.tagName).toBe(false);
    }
    const symbols = new Set(
      Array.from(section?.querySelectorAll("symbol") ?? [], (symbol) => `#${symbol.id}`),
    );
    for (const href of uses) expect(symbols.has(href ?? ""), href ?? "").toBe(true);
  });

  it("draws each mark in one fill of the text colour, never a brand colour or a gradient", async () => {
    const section = (await render()).querySelector("section#marquee");
    const shapes = Array.from(section?.querySelectorAll("symbol > *") ?? []);
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(shape.tagName.toLowerCase()).toBe("path");
      expect(shape.getAttribute("fill")).toBe("currentColor");
      expect(shape.hasAttribute("stroke")).toBe(false);
      expect(shape.hasAttribute("style")).toBe(false);
    }
    expect(section?.querySelectorAll("linearGradient, radialGradient, filter")).toHaveLength(0);
  });

  it("lists every mark in its sprite in the third-party notices with its source, version and a license that allows commercial use and adaptation", async () => {
    const section = (await render()).querySelector("section#marquee");
    const slugs = Array.from(section?.querySelectorAll("symbol") ?? [], (symbol) =>
      symbol.id.replace(/^marquee-mark-/, ""),
    );
    expect(slugs.length).toBeGreaterThan(0);
    const notices = JSON.parse(
      readFileSync(join(process.cwd(), "lib/licenses.generated.json"), "utf8"),
    ) as { assets: ReadonlyArray<{ name: string; license: string; usage: string }> };
    for (const slug of slugs) {
      const entry = notices.assets.find((asset) =>
        new RegExp(`^.+ mark \\([@\\w/.-]+@\\d+\\.\\d+\\.\\d+, icons/${slug}\\.svg\\)$`).test(
          asset.name,
        ),
      );
      expect(entry, slug).toBeDefined();
      const tokens = entry?.license.toUpperCase().split(/[^A-Z0-9.]+/) ?? [];
      expect(tokens, slug).not.toContain("NC");
      expect(tokens, slug).not.toContain("SA");
      expect(entry?.usage, slug).toContain(
        "Logos are trademarks of their owners, used to identify compatibility.",
      );
    }
  });

  it("names each item in text, beside an aria-hidden mark or file-extension chip", async () => {
    const doc = await render();
    for (const item of Array.from(doc.querySelectorAll(".vk-marquee-item"))) {
      const marks = item.querySelectorAll(":scope > .vk-marquee-mark, :scope > .vk-marquee-chip");
      expect(marks, item.getAttribute("data-item") ?? "").toHaveLength(1);
      expect(marks[0]?.getAttribute("aria-hidden")).toBe("true");
      expect(item.querySelector(":scope > .vk-marquee-name")?.textContent?.length).toBeGreaterThan(
        0,
      );
    }
    const chips = Array.from(doc.querySelectorAll(".vk-marquee-chip"), (chip) => chip.textContent);
    for (const text of chips) expect(text).toMatch(/^[./][a-z0-9]+$/);
  });

  it("names each visible list by its row title and hides every copy from assistive technology and focus", async () => {
    const doc = await render();
    for (const id of ["providers", "formats"]) {
      const element = row(doc, id);
      const [visible, ...copies] = Array.from(element.querySelectorAll(".vk-marquee-list"));
      expect(visible?.getAttribute("aria-labelledby")).toBe(element.querySelector("h3")?.id);
      expect(visible?.hasAttribute("aria-hidden")).toBe(false);
      expect(copies).toHaveLength(MARQUEE_COPIES);
      for (const hidden of copies) {
        expect(hidden.getAttribute("aria-hidden")).toBe("true");
        expect(hidden.hasAttribute("inert")).toBe(true);
        expect(hidden.querySelector("a, button")).toBeNull();
      }
    }
  });

  it("ends each row with a link to its docs page, outside the moving track", async () => {
    const doc = await render("de");
    const providers = row(doc, "providers");
    const formats = row(doc, "formats");
    const providersLink = providers.querySelector(":scope > a");
    const formatsLink = formats.querySelector(":scope > a");
    expect(providersLink?.getAttribute("href")).toBe("/de/docs/providers");
    expect(providersLink?.textContent).toBe(german.landing.marquee.allProviders);
    expect(formatsLink?.getAttribute("href")).toBe("/de/docs/formats");
    expect(formatsLink?.textContent).toBe(german.landing.marquee.allFormats);
    expect(providers.lastElementChild).toBe(providersLink);
    expect(providers.querySelector(".vk-marquee-track a")).toBeNull();
  });

  it("server-renders the static state: no motion state, the pause button unpressed before the rows", async () => {
    const doc = await render();
    const marquee = doc.querySelector(".vk-marquee");
    expect(marquee?.hasAttribute("data-marquee")).toBe(false);
    const button = marquee?.firstElementChild;
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(button?.textContent).toBe(copy.pause);
  });
});

describe("MarqueeMotion", () => {
  it("marks itself running once hydrated and toggles the paused state with aria-pressed", () => {
    const host = mountToggle();
    const marquee = host.querySelector(".vk-marquee");
    const button = host.querySelector("button");
    expect(marquee?.getAttribute("data-marquee")).toBe("running");
    expect(button?.getAttribute("aria-pressed")).toBe("false");

    act(() => button?.click());
    expect(marquee?.getAttribute("data-marquee")).toBe("paused");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(button?.textContent).toBe(copy.pause);

    act(() => button?.click());
    expect(marquee?.getAttribute("data-marquee")).toBe("running");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
  });

  it.each(["dark", "light"] as const)(
    "draws the pause button's boundary at 3:1 or more against the band in the %s theme",
    (theme) => {
      const button = mountToggle().querySelector("button");
      const border = /(?:^|\s)border-\((--[\w-]+)\)/.exec(button?.className ?? "")?.[1];
      if (border === undefined) throw new Error("the pause button has no border token");
      const tokens = themeTokens()[theme];
      expect(contrast(tokens, border, "--surface-band")).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("the marquee stylesheet", () => {
  const rules = docsStylesheetRules();

  it("draws each list item as a fill with no ring, so it does not read as a button", () => {
    const item = rulesFor(rules, ".vk-marquee-item").find((rule) => rule.media === "");
    expect(item?.declarations.background).toBe("var(--surface-bg)");
    expect(item?.declarations.border).toBeUndefined();
    expect(item?.declarations["box-shadow"]).toBeUndefined();
  });

  const MOTION_ALLOWED = "@media (prefers-reduced-motion: no-preference) and (scripting: enabled)";

  it("keeps the copies and the button out of the static state, and wraps without motion or script", () => {
    const copyRule = rules.find((rule) => rule.selector === ".vk-marquee-copy" && !rule.media);
    expect(copyRule?.declarations.display).toBe("none");
    const toggle = rules.find((rule) => rule.selector === ".vk-marquee-toggle" && !rule.media);
    expect(toggle?.declarations.display).toBe("none");
    const list = rules.find((rule) => rule.selector === ".vk-marquee-list" && !rule.media);
    expect(list?.declarations["flex-wrap"]).toBe("wrap");
    expect(list?.declarations.animation).toBeUndefined();
  });

  it("holds the moving state's box before takeover where motion may start: a reserved toggle and one scrolling line", () => {
    const at = (selector: string) =>
      rules.find((rule) => rule.selector === selector && rule.media === MOTION_ALLOWED)
        ?.declarations;
    expect(at(".vk-marquee-toggle")).toEqual({ display: "inline-flex", visibility: "hidden" });
    expect(at(".vk-marquee-list")).toEqual({ flex: "none", "flex-wrap": "nowrap" });
    expect(at(".vk-marquee-viewport")?.["scrollbar-width"]).toBe("none");
    expect(
      at("html[data-motion-ready] .vk-marquee[data-marquee] .vk-marquee-toggle")?.visibility,
    ).toBe("visible");
    const moving = rules.filter(
      (rule) =>
        rule.media === MOTION_ALLOWED && rule.selector.startsWith("html[data-motion-ready]"),
    );
    for (const rule of moving) {
      expect(rule.declarations).not.toHaveProperty("display", "none");
      expect(rule.declarations).not.toHaveProperty("flex-wrap");
      expect(rule.declarations).not.toHaveProperty("height");
      expect(rule.declarations).not.toHaveProperty("padding");
    }
  });

  it("names the scrolling row by its title and makes it a keyboard stop", async () => {
    const doc = await render();
    for (const id of ["providers", "formats"]) {
      const viewport = row(doc, id).querySelector(".vk-marquee-viewport");
      expect(viewport?.getAttribute("role")).toBe("group");
      expect(viewport?.getAttribute("tabindex")).toBe("0");
      expect(viewport?.getAttribute("aria-labelledby")).toBe(`marquee-${id}`);
    }
  });

  it("moves only under no-preference, after the motion root and the island are both ready", () => {
    const moving = rules.filter(
      (rule) => rule.selector.includes("vk-marquee") && "animation" in rule.declarations,
    );
    expect(moving.length).toBeGreaterThan(0);
    for (const rule of moving) {
      expect(rule.media).toBe(MOTION_ALLOWED);
      expect(rule.selector).toContain("html[data-motion-ready] .vk-marquee[data-marquee]");
    }
  });

  it("pauses on the button, on hover and on focus inside a row, outranking the animation shorthand", () => {
    const paused = rules.filter((rule) => rule.declarations["animation-play-state"] === "paused");
    expect(paused.flatMap((rule) => rule.selector.split(/,\s*/))).toEqual([
      'html[data-motion-ready] .vk-marquee[data-marquee="paused"] .vk-marquee-list',
      "html[data-motion-ready] .vk-marquee[data-marquee] .vk-marquee-row:hover .vk-marquee-list",
      "html[data-motion-ready] .vk-marquee[data-marquee] .vk-marquee-row:focus-within .vk-marquee-list",
    ]);
  });
});

// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_MESSAGES_URL } from "@/components/landing/links";
import { HERO_HEADLINES } from "@/lib/hero-lines";
import type { Locale } from "@/lib/i18n";
import { HERO_NUMBERS, VERSION_LINE } from "@/lib/landing-facts";

const page: { locale: Locale } = { locale: "en" };

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => page.locale,
}));

const panelLabels: Array<Record<string, string>> = [];
vi.mock("@/components/landing/command-panel", () => ({
  CommandPanel: ({ labels }: { labels: Record<string, string> }) => {
    panelLabels.push(labels);
    return <div data-part="command-panel" />;
  },
}));

const { LandingHero } = await import("./landing-hero");

const GLOBAL_CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
const FLAT_CSS = GLOBAL_CSS.replace(/\s+/g, " ");
const HERO_SOURCE = readFileSync(join(process.cwd(), "components/landing-hero.tsx"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(GLOBAL_CSS)?.[1] ?? "";
}

function token(name: string): string {
  return new RegExp(`${name}: ([^;]+);`).exec(GLOBAL_CSS)?.[1]?.trim() ?? "";
}

async function renderHero(locale: Locale = "en"): Promise<Document> {
  page.locale = locale;
  const markup = renderToStaticMarkup(await LandingHero());
  return new DOMParser().parseFromString(markup, "text/html");
}

function relativeLuminance(hsl: string): number {
  const [h = 0, s = 0, l = 0] = (hsl.match(/[\d.]+/g) ?? []).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (x, y) => y - x,
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

beforeEach(() => {
  panelLabels.length = 0;
});

describe("LandingHero: living headline", () => {
  it("sets the page's own headline as the h1, with the locale code outside it", async () => {
    const doc = await renderHero();
    const h1 = doc.querySelector("h1");
    expect(h1?.textContent).toBe("headline");
    const code = h1?.previousElementSibling;
    expect(code?.getAttribute("aria-hidden")).toBe("true");
    expect(code?.textContent).toBe("en");
  });

  it.each([
    ["en", ["de", "fr"]],
    ["de", ["en", "fr"]],
    ["es", ["en", "de"]],
    ["fr", ["en", "de"]],
  ] as const)(
    "on %s, follows the h1 with the headline of %j from their own catalogs",
    async (locale, rows) => {
      const doc = await renderHero(locale);
      const items = [...doc.querySelectorAll(".vk-hero-locales > li")];
      expect(items.map((item) => item.getAttribute("lang"))).toEqual(rows);
      for (const [index, item] of items.entries()) {
        const row = rows[index] as Locale;
        expect(item.querySelector('[aria-hidden="true"]')?.textContent).toBe(row);
        expect(item.lastElementChild?.textContent).toBe(HERO_HEADLINES[row]);
      }
    },
  );

  it("draws no box, flag or connector around the locale rows", () => {
    for (const selector of [".vk-hero-locales", ".vk-hero-locale", ".vk-hero-line"]) {
      expect(rule(selector), selector).not.toMatch(/border|background|box-shadow|::before/);
    }
    expect(HERO_SOURCE).not.toMatch(/flag|connector/i);
  });

  it("shares the sections' left edge: codes stack above the text, then hang in the margin from 48rem", () => {
    expect(HERO_SOURCE).toContain('className="vk-hero vk-w-wide mx-auto w-full"');
    expect(rule(".vk-hero-line")).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(FLAT_CSS).toContain(
      "@media (min-width: 48rem) { .vk-hero-line { grid-template-columns: var(--width-hero-gutter) minmax(0, 1fr); margin-inline-start: calc(-1 * var(--width-hero-gutter)); } }",
    );
    expect(FLAT_CSS).not.toMatch(/\.vk-hero-(caption|body)[^{]*\{[^}]*padding-inline-start/);
  });

  it("splits the body into two columns only from 80rem, so the intro never narrows at 1024", () => {
    expect(rule(".vk-hero-body")).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(FLAT_CSS).toMatch(
      /@media \(min-width: 80rem\) \{ \.vk-hero-body \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, var\(--width-hero-panel\)\);/,
    );
    expect(FLAT_CSS).not.toMatch(/@media \(min-width: 64rem\) \{[^@]*\.vk-hero-body/);
    expect(rule(".vk-hero-numbers")).toContain("grid-auto-flow: column;");
    expect(rule(".vk-hero-numbers")).not.toContain("wrap");
  });

  it("shows one locale row at phone width and both from 40rem", () => {
    expect(FLAT_CSS).toContain(".vk-hero-locale:nth-child(n + 2) { display: none; }");
    expect(FLAT_CSS).toContain(
      "@media (min-width: 40rem) { .vk-hero-locale:nth-child(n + 2) { display: grid; }",
    );
  });

  it("dims the locale rows without dropping under 4.5:1 on the void page", () => {
    expect(rule(".vk-hero-locale")).toContain("color: var(--text-muted);");
    expect(token("--text-muted")).toBe("var(--color-fd-muted-foreground)");
    expect(token("--text-faint")).toBe("hsl(240 13% 58%)");
    const background = token("--v-void");
    expect(contrast(token("--color-fd-muted-foreground"), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--text-faint"), background)).toBeGreaterThanOrEqual(4.5);
  });

  it("reveals only the locale rows once, and not at all under reduced motion", () => {
    expect(FLAT_CSS).toContain(
      "@media (prefers-reduced-motion: no-preference) { .vk-hero-locale { animation: vk-locale-in",
    );
    expect(rule(".vk-hero-title")).not.toContain("animation");
    expect(FLAT_CSS).not.toMatch(/vk-locale-in[^;]*infinite/);
  });

  it("captions the rows with the dogfooding claim, linked to this site's message files", async () => {
    const doc = await renderHero();
    const caption = doc.querySelector(".vk-hero-lines > p.vk-hero-caption");
    expect(caption?.textContent).toBe("dogfood dogfoodLink");
    const link = caption?.querySelector("a");
    expect(link?.getAttribute("href")).toBe(SITE_MESSAGES_URL);
    expect(SITE_MESSAGES_URL).toBe(
      "https://github.com/verbatra/verbatra/tree/main/apps/docs/messages",
    );
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
    expect(link?.getAttribute("data-umami-event")).toBe("outbound-link");
  });
});

describe("LandingHero: not the NestJS composition", () => {
  it("drops the inset card, the wash, the grain and the drift", async () => {
    const doc = await renderHero();
    for (const name of ["vk-hero-surface", "vk-hero-wash", "vk-hero-grid", "vk-hero-facts"]) {
      expect(doc.querySelector(`.${name}`), name).toBeNull();
      expect(GLOBAL_CSS, name).not.toContain(`.${name}`);
    }
    for (const name of ["--wash-hero", "--grain-hero", "--radius-hero", "--duration-drift"]) {
      expect(GLOBAL_CSS, name).not.toContain(name);
    }
    expect(GLOBAL_CSS).not.toContain("vk-hero-drift");
  });

  it("aligns everything to the start edge rather than a centre axis", async () => {
    const doc = await renderHero();
    expect(doc.querySelector("h1")?.closest(".text-center")).toBeNull();
    expect(rule(".vk-hero-title")).not.toContain("text-align");
  });

  it("sets the headline heavier, looser and smaller than 104px / 0.95 / 500", () => {
    expect(rule(".vk-hero-title")).toContain("font-size: var(--text-hero);");
    expect(rule(".vk-hero-title")).toContain("font-weight: var(--weight-hero);");
    expect(rule(".vk-hero-title")).toContain("line-height: var(--leading-hero);");
    expect(token("--text-hero")).toBe("clamp(2.5rem, 1.25rem + 4vw, 5rem)");
    expect(token("--weight-hero")).toBe("700");
    expect(token("--leading-hero")).toBe("1.04");
    expect(token("--tracking-hero")).toBe("-0.03em");
  });

  it("sets the lead in the body sans, not mono", async () => {
    const doc = await renderHero();
    expect(doc.querySelector("p.vk-lead.vk-hero-lead")?.textContent).toBe("lead");
    expect(rule(".vk-hero-lead")).not.toContain("font-mono");
    expect(rule(".vk-hero-lead")).not.toContain("--font-mono");
  });

  it("offers one button and one command panel instead of two pill calls to action", async () => {
    const doc = await renderHero();
    const intro = doc.querySelector(".vk-hero-intro");
    expect([...(intro?.querySelectorAll("a, button") ?? [])].map((a) => a.textContent)).toEqual([
      "ctaStart",
    ]);
    expect(intro?.querySelector("a")?.getAttribute("href")).toBe("/docs/quickstart");
    expect(doc.querySelectorAll('[data-part="command-panel"]')).toHaveLength(1);
    expect(panelLabels).toEqual([
      {
        tablist: "command.tablist",
        install: "command.install",
        prompt: "command.prompt",
        installHint: "command.installHint",
        promptHint: "command.promptHint",
      },
    ]);
    expect(HERO_SOURCE).not.toContain("PromptCopyButton");
    expect(HERO_SOURCE).not.toContain("CommandRow");
  });

  it("states at most three big numbers from landing-facts, with the version as one plain small line, never a table", async () => {
    const doc = await renderHero();
    const items = [...doc.querySelectorAll(".vk-hero-numbers > li")];
    expect(items).toHaveLength(HERO_NUMBERS.length);
    expect(HERO_NUMBERS.length).toBeLessThanOrEqual(3);
    expect(items.map((item) => item.querySelector(".vk-hero-number-value")?.textContent)).toEqual(
      HERO_NUMBERS.map((number) => String(number.value)),
    );
    expect(items.map((item) => item.querySelector(".vk-hero-number-label")?.textContent)).toEqual(
      HERO_NUMBERS.map((number) => `numbers.${number.key}`),
    );
    expect(doc.querySelector(".vk-hero-release")?.textContent).toBe(VERSION_LINE);
    expect(HERO_SOURCE).not.toMatch(/Latest release|t\("release"\)/);
    expect(doc.querySelector("section dl, section table")).toBeNull();
    expect(rule(".vk-hero-release")).toContain("font-size: var(--text-xs);");
  });

  it("orders the headline, rows, caption, lead, button, panel and numbers, with no demo inside the hero", async () => {
    const doc = await renderHero();
    const parts = [
      ...doc.querySelectorAll(
        "h1, .vk-hero-locales, .vk-hero-caption, .vk-hero-lead, .vk-hero-intro a, [data-part], .vk-hero-numbers",
      ),
    ].map((element) => element.getAttribute("data-part") ?? element.className.split(" ")[0]);
    expect(parts).toEqual([
      "vk-hero-title",
      "vk-hero-locales",
      "vk-hero-caption",
      "vk-lead",
      "group",
      "command-panel",
      "vk-hero-numbers",
    ]);
  });
});

describe("LandingHero: largest contentful paint", () => {
  it("renders the h1 on the server, outside every animated wrapper", async () => {
    expect(HERO_SOURCE.startsWith('"use client"')).toBe(false);
    const doc = await renderHero();
    const h1 = doc.querySelector("h1");
    expect(h1?.closest(".vk-hero-locale")).toBeNull();
    expect(GLOBAL_CSS).not.toContain(".vk-rise");
  });

  it("keeps the hero server-rendered with the command panel as its only client island", () => {
    const panel = readFileSync(join(process.cwd(), "components/landing/command-panel.tsx"), "utf8");
    expect(panel.startsWith('"use client"')).toBe(true);
    const imports = [...HERO_SOURCE.matchAll(/from "(@\/components\/[^"]+)"/g)].map(
      ([, path]) => path,
    );
    expect(imports).toEqual([
      "@/components/landing/command-panel",
      "@/components/landing/links",
      "@/components/ui/button",
    ]);
  });
});

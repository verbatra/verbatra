// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LICENSE_URL, RELEASES_URL, SITE_MESSAGES_URL } from "@/components/landing/links";
import { HERO_HEADLINE_LOCK_HASH, HERO_HEADLINES } from "@/lib/hero-ledger";
import type { Locale } from "@/lib/i18n";
import { FORMAT_COUNT, HERO_FACTS, PROVIDER_COUNT } from "@/lib/landing-facts";
import { PACKAGE_VERSION } from "@/lib/site";

const page: { locale: Locale } = { locale: "en" };

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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

function componentImports(source: string): ReadonlyArray<string> {
  return [...source.matchAll(/from "(@\/components\/[^"]+)"/g)].map(([, path]) => path ?? "");
}

function componentSource(path: string): string {
  const base = join(process.cwd(), path.replace("@/", ""));
  const file = [".tsx", ".ts"].map((extension) => `${base}${extension}`).find(existsSync);
  if (file === undefined) throw new Error(`no source for ${path}`);
  return readFileSync(file, "utf8");
}

function clientIslands(source: string): ReadonlyArray<string> {
  const islands = new Set<string>();
  const visit = (code: string) => {
    for (const path of componentImports(code)) {
      const imported = componentSource(path);
      if (imported.startsWith('"use client"')) islands.add(path);
      else visit(imported);
    }
  };
  visit(source);
  return [...islands].toSorted();
}

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

describe("LandingHero: headline and ledger", () => {
  it("sets the page's own headline as the one h1, with no locale code inside the hero copy", async () => {
    const doc = await renderHero();
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.querySelector("h1")?.textContent).toBe("headline");
    expect(doc.querySelector(".vk-hero-copy [aria-hidden]")).toBeNull();
  });

  it.each([
    ["en", ["en", "de", "es", "fr"]],
    ["de", ["en", "de", "es", "fr"]],
    ["es", ["en", "es", "de", "fr"]],
    ["fr", ["en", "fr", "de", "es"]],
  ] as const)(
    "on %s, prints the headline from %j message files, each value in its own lang",
    async (locale, order) => {
      const doc = await renderHero(locale);
      const rows = [...doc.querySelectorAll("figure.vk-ledger .vk-ledger-row")];
      expect(rows.map((row) => row.querySelector(".vk-ledger-file")?.textContent)).toEqual(
        order.map((code) => `messages/${code}.json`),
      );
      for (const [index, row] of rows.entries()) {
        const code = order[index] as Locale;
        const value = row.querySelector(".vk-ledger-value");
        expect(value?.getAttribute("lang")).toBe(code);
        expect(value?.textContent).toBe(`"${HERO_HEADLINES[code]}"`);
      }
      expect(rows[0]?.hasAttribute("data-source")).toBe(true);
      expect(rows.slice(1).some((row) => row.hasAttribute("data-source"))).toBe(false);
    },
  );

  it("closes the ledger on the headline's real lock hash", async () => {
    const doc = await renderHero();
    const lock = doc.querySelector(".vk-ledger-lock");
    expect(lock?.querySelector(".vk-ledger-file")?.textContent).toBe("verbatra.lock.json");
    expect(lock?.querySelector(".vk-ledger-hash")?.textContent).toBe(
      `"${HERO_HEADLINE_LOCK_HASH}"`,
    );
    expect(HERO_SOURCE).not.toContain(HERO_HEADLINE_LOCK_HASH);
  });

  it("shows the source and one target at phone width and every file from 40rem", () => {
    expect(FLAT_CSS).toContain(".vk-ledger-row:nth-child(n + 3) { display: none; }");
    expect(FLAT_CSS).toContain(
      "@media (min-width: 40rem) { .vk-ledger-row:nth-child(n + 3) { display: grid; }",
    );
  });

  it("sets the ledger as a void code figure, not a card", () => {
    expect(rule(".vk-ledger-frame")).toContain("background: var(--v-void);");
    expect(rule(".vk-ledger-frame")).toContain("border: 1px solid var(--border-default);");
    expect(rule(".vk-ledger-frame")).not.toContain("box-shadow");
  });

  it("keeps the ledger's muted and faint text at 4.5:1 or more on the void", () => {
    expect(rule(".vk-ledger-file")).toContain("color: var(--text-faint);");
    expect(rule(".vk-ledger-key")).toContain("color: var(--text-muted);");
    const background = token("--v-void");
    expect(contrast(token("--color-fd-muted-foreground"), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--text-faint"), background)).toBeGreaterThanOrEqual(4.5);
  });

  it("captions the ledger with the dogfooding claim, linked to this site's message files", async () => {
    const doc = await renderHero();
    const caption = doc.querySelector("figure.vk-ledger > figcaption");
    expect(caption?.textContent).toBe("ledger.caption dogfood dogfoodLink");
    const link = caption?.querySelector("a");
    expect(link?.getAttribute("href")).toBe(SITE_MESSAGES_URL);
    expect(SITE_MESSAGES_URL).toBe(
      "https://github.com/verbatra/verbatra/tree/main/apps/docs/messages",
    );
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
    expect(link?.getAttribute("data-umami-event")).toBe("outbound-link");
    expect(link?.getAttribute("data-umami-event-target")).toBe("site-messages");
    expect(link?.getAttribute("data-umami-event-location")).toBe("hero");
  });

  it("puts the ledger beside the copy only from 80rem, on an 8 and 4 column split, the headline capped to its column", () => {
    expect(rule(".vk-hero-main")).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(FLAT_CSS).toMatch(
      /@media \(min-width: 80rem\) \{ \.vk-hero-main \{ grid-template-columns: repeat\(var\(--grid-columns\), minmax\(0, 1fr\)\);/,
    );
    expect(FLAT_CSS).toContain(
      ".vk-hero-copy { grid-column: span 8; container-type: inline-size; }",
    );
    expect(FLAT_CSS).toContain(".vk-hero-title { font-size: min(var(--text-hero), 10.6cqi); }");
    expect(FLAT_CSS).toContain("grid-column: 9 / span 4;");
    expect(FLAT_CSS).not.toMatch(/@media \(min-width: 64rem\) \{[^@]*\.vk-hero-main/);
  });
});

describe("LandingHero: blueprint grid", () => {
  it("draws the shared grid pattern behind the hero, masked by --hero-grid-mask and hidden from assistive technology", async () => {
    const doc = await renderHero();
    const grid = doc.querySelector(".vk-hero-blueprint");
    expect(grid?.getAttribute("aria-hidden")).toBe("true");
    expect(grid?.getAttribute("style")).toContain("background-size:56px 56px");
    expect(HERO_SOURCE).toContain("style={GRID_PATTERN_STYLE}");
    expect(rule(".vk-hero-blueprint")).toContain("mask-image: var(--hero-grid-mask);");
    expect(rule(".vk-hero-blueprint")).toContain("pointer-events: none;");
  });

  it("never moves the grid", () => {
    expect(rule(".vk-hero-blueprint")).not.toMatch(/animation|transition/);
    expect(FLAT_CSS).not.toMatch(/\.vk-hero-blueprint[^{]*\{[^}]*animation/);
  });
});

describe("LandingHero: not the NestJS composition", () => {
  it("drops the inset card, the wash, the grain and the drift", async () => {
    const doc = await renderHero();
    for (const name of ["vk-hero-surface", "vk-hero-wash", "vk-hero-grid"]) {
      expect(doc.querySelector(`.${name}`), name).toBeNull();
      expect(GLOBAL_CSS, name).not.toContain(`.${name} `);
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

  it("sets the headline one step larger at 1440 than before, still under 104px", () => {
    expect(rule(".vk-hero-title")).toContain("font-size: var(--text-hero);");
    expect(rule(".vk-hero-title")).toContain("font-weight: var(--weight-hero);");
    expect(rule(".vk-hero-title")).toContain("line-height: var(--leading-hero);");
    expect(token("--text-hero")).toBe("clamp(2.5rem, 0.25rem + 6.5vw, 6.25rem)");
    const at1440 = 0.25 * 16 + 0.065 * 1440;
    const before = 1.25 * 16 + 0.04 * 1440;
    expect(at1440 / before).toBeGreaterThanOrEqual(1.25);
    expect(6.25 * 16).toBeLessThan(104);
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

  it("offers Get started and Try it in the browser, then one command panel", async () => {
    const doc = await renderHero();
    const ctas = [...doc.querySelectorAll(".vk-hero-ctas a")];
    expect(ctas.map((a) => a.textContent)).toEqual(["ctaStart", "ctaTry"]);
    expect(ctas.map((a) => a.getAttribute("href"))).toEqual(["/docs/quickstart", "#showcase"]);
    for (const cta of ctas) expect(cta.hasAttribute("data-umami-event")).toBe(false);
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

  it("localizes the Get started link and keeps the showcase jump on the page", async () => {
    const doc = await renderHero("de");
    const ctas = [...doc.querySelectorAll(".vk-hero-ctas a")];
    expect(ctas.map((a) => a.getAttribute("href"))).toEqual(["/de/docs/quickstart", "#showcase"]);
  });

  it("states four facts in digits, each linked to the page that owns it, never spelled out", async () => {
    const doc = await renderHero();
    const items = [...doc.querySelectorAll(".vk-hero-facts > li")];
    expect(items).toHaveLength(HERO_FACTS.length);
    expect(items.map((item) => item.textContent)).toEqual([
      `v${PACKAGE_VERSION}`,
      "MIT",
      `${FORMAT_COUNT} facts.formats`,
      `${PROVIDER_COUNT} facts.providers`,
    ]);
    const links = items.map((item) => item.querySelector("a"));
    expect(links.map((link) => link?.getAttribute("href"))).toEqual([
      RELEASES_URL,
      LICENSE_URL,
      "/docs/formats",
      "/docs/providers",
    ]);
    for (const link of links.slice(0, 2)) {
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("data-umami-event")).toBe("outbound-link");
      expect(link?.getAttribute("data-umami-event-location")).toBe("hero");
    }
    for (const link of links.slice(2)) expect(link?.hasAttribute("data-umami-event")).toBe(false);
    expect(rule(".vk-hero-facts")).toContain("font-family: var(--font-mono);");
    expect(doc.querySelector("section dl, section table")).toBeNull();
  });

  it("orders the headline, lead, buttons, panel, facts and then the ledger", async () => {
    const doc = await renderHero();
    const parts = [
      ...doc.querySelectorAll(
        "h1, .vk-hero-lead, .vk-hero-ctas, [data-part], .vk-hero-facts, figure.vk-ledger",
      ),
    ].map((element) => element.getAttribute("data-part") ?? element.className.split(" ")[0]);
    expect(parts).toEqual([
      "vk-hero-title",
      "vk-lead",
      "vk-hero-ctas",
      "command-panel",
      "vk-hero-facts",
      "vk-ledger",
    ]);
  });
});

describe("LandingHero: largest contentful paint", () => {
  it("renders the h1 on the server and never animates it", async () => {
    expect(HERO_SOURCE.startsWith('"use client"')).toBe(false);
    expect(rule(".vk-hero-title")).not.toContain("animation");
    expect(GLOBAL_CSS).not.toContain(".vk-rise");
    expect(GLOBAL_CSS).not.toContain("vk-locale-in");
  });

  it("keeps the hero server-rendered with the command panel and the tracked links as its client islands", () => {
    const ledger = readFileSync(
      join(process.cwd(), "components/landing/locale-ledger.tsx"),
      "utf8",
    );
    expect(ledger.startsWith('"use client"')).toBe(false);
    expect(clientIslands(HERO_SOURCE)).toEqual([
      "@/components/landing/command-panel",
      "@/components/ui/tracked-link",
    ]);
  });
});

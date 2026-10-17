// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GITHUB_URL, LICENSE_URL, releaseUrl } from "@/components/landing/links";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { LANDING_TRACK_IDS, LANDING_TRACKS } from "@/lib/landing-tracks";
import { nodeVersionsLabel } from "@/lib/node-requirement";
import { NODE_RANGE, PACKAGE_VERSION } from "@/lib/site";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import messages from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";
import { HERO_TRACKS_ID } from "./hero-tracks";

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
  const { default: catalog } = await import("@/messages/en.json");
  return {
    getTranslations: async (scope: string | { namespace: string }) =>
      createTranslator({
        locale: "en",
        messages: catalog,
        namespace: (typeof scope === "string" ? scope : scope.namespace) as never,
      }),
    getLocale: async () => page.locale,
  };
});

const { Hero, HERO_TITLE_ID } = await import("./hero");

await preloadRegisteredIslands();

async function render(locale = "en"): Promise<Document> {
  page.locale = locale;
  const html = renderToStaticMarkup(await Hero());
  return new DOMParser().parseFromString(html, "text/html");
}

const banner = messages.landing.banner;
const tracks = messages.landing.hero.tracks;
const newTab = messages.landing.openSource.newTab;

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

function panel(doc: Document, id: string): Element | null {
  return doc.getElementById(`${HERO_TRACKS_ID}-panel-${id}`);
}

describe("Hero copy", () => {
  it("names its section by the one h1, the headline, under the subline", async () => {
    const doc = await render();
    const h1s = doc.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(banner.headline);
    expect(h1s[0]?.id).toBe(HERO_TITLE_ID);
    expect(doc.querySelector("section")?.getAttribute("aria-labelledby")).toBe(HERO_TITLE_ID);
    expect(h1s[0]?.nextElementSibling?.textContent).toBe(banner.lead);
  });

  it("keeps the headline to eight words and the subline to twenty-five, with no two-beat slogan", () => {
    expect(words(banner.headline)).toBeLessThanOrEqual(8);
    expect(words(banner.lead)).toBeLessThanOrEqual(25);
    expect(banner.headline.split(/[.!?]\s/)).toHaveLength(1);
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

  it("keeps the pill's ring, shimmer and chevron away from assistive technology", async () => {
    const announce = (await render()).querySelector(".vk-announce");
    for (const part of announce?.querySelectorAll(
      ".vk-pill-new-ring, .vk-pill-new-shimmer, .vk-announce-chevron",
    ) ?? []) {
      expect(part.getAttribute("aria-hidden")).toBe("true");
    }
    expect(announce?.querySelectorAll("[aria-hidden='true']")).toHaveLength(3);
  });

  it("offers Get started to the quickstart and Star on GitHub in a new tab", async () => {
    const links = Array.from((await render()).querySelectorAll(".vk-banner-ctas a"));
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      [banner.ctaPrimary, "/docs/quickstart"],
      [`${banner.ctaSecondary} ${newTab}`, GITHUB_URL],
    ]);
    expect(links[1]?.getAttribute("target")).toBe("_blank");
    expect(links[1]?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("prefixes the quickstart and every track link with a non-default locale", async () => {
    const doc = await render("de");
    expect(doc.querySelector(".vk-banner-ctas a")?.getAttribute("href")).toBe(
      "/de/docs/quickstart",
    );
    expect(
      Array.from(doc.querySelectorAll(".vk-track-summary a"), (link) => link.getAttribute("href")),
    ).toEqual(LANDING_TRACK_IDS.map((id) => `/de${LANDING_TRACKS[id].docsPath}`));
  });

  it("ends the copy with one honest trust line: the license and the Node.js range, not a fact grid", async () => {
    const doc = await render();
    const trust = doc.querySelector(".vk-banner-copy > .vk-banner-trust");
    expect(trust?.tagName).toBe("P");
    const license = trust?.querySelector("a");
    expect(license?.getAttribute("href")).toBe(LICENSE_URL);
    expect(license?.textContent).toBe(`${banner.license} ${newTab}`);
    const majorFrom = (major: string, minimum: string) =>
      banner.nodeMajorFrom.replace("{major}", major).replace("{minimum}", minimum);
    expect(trust?.querySelector("span:not(.sr-only)")?.textContent).toBe(
      banner.nodeRequirement.replace("{versions}", nodeVersionsLabel(NODE_RANGE, "en", majorFrom)),
    );
    expect(doc.querySelector("dl, .vk-facts, .vk-banner-facts")).toBeNull();
  });
});

describe("Hero tracks", () => {
  it("draws no install box, no copy button and no prompt: the closing section owns the install", async () => {
    const doc = await render();
    expect(doc.querySelector(".vk-command-panel, .vk-banner-install, .vk-copy")).toBeNull();
    expect(doc.querySelector("button[aria-label]")).toBeNull();
    expect(doc.body.textContent).not.toContain(NPM_INSTALL_COMMAND);
    expect(doc.body.textContent).not.toContain(AI_SETUP_PROMPT.slice(0, 40));
  });

  it("switches the three tracks through one labelled tablist with a roving tab stop", async () => {
    const doc = await render();
    const lists = doc.querySelectorAll(".vk-banner-demo [role='tablist']");
    expect(lists).toHaveLength(1);
    expect(lists[0]?.getAttribute("aria-label")).toBe(tracks.label);
    const tabs = Array.from(lists[0]?.querySelectorAll("[role='tab']") ?? []);
    expect(tabs.map((tab) => tab.textContent)).toEqual(
      LANDING_TRACK_IDS.map((id) => tracks[id].tab),
    );
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    for (const [index, id] of LANDING_TRACK_IDS.entries()) {
      const target = tabs[index]?.getAttribute("aria-controls") ?? "";
      expect(panel(doc, id)?.id).toBe(target);
      expect(panel(doc, id)?.getAttribute("role")).toBe("tabpanel");
      expect(panel(doc, id)?.getAttribute("aria-labelledby")).toBe(tabs[index]?.id);
    }
  });

  it("server-renders every track in its final state, the default one open and the others inert", async () => {
    const doc = await render();
    expect(doc.querySelectorAll("[data-state]:not([data-state='done'])")).toHaveLength(0);
    expect(doc.querySelectorAll(".vk-track-typed, .vk-track-caret")).toHaveLength(0);
    for (const id of LANDING_TRACK_IDS) {
      const open = id === LANDING_TRACK_IDS[0];
      expect(panel(doc, id)?.getAttribute("data-active")).toBe(String(open));
      expect(panel(doc, id)?.hasAttribute("inert")).toBe(!open);
    }
  });

  it("prints each track's pinned commands, recorded result and exit code, English on every locale", async () => {
    const doc = await render("de");
    for (const id of LANDING_TRACK_IDS) {
      const track = LANDING_TRACKS[id];
      const body = panel(doc, id)?.querySelector(".vk-track-body");
      expect(body?.getAttribute("lang")).toBe("en");
      expect(
        Array.from(
          body?.querySelectorAll(".vk-track-command code") ?? [],
          (code) => code.textContent,
        ),
      ).toEqual(track.commands);
      expect(
        Array.from(body?.querySelectorAll(".vk-track-out") ?? [], (line) => line.textContent),
      ).toEqual(track.result);
      expect(panel(doc, id)?.querySelector(".vk-track-title")?.textContent).toBe(
        track.terminalTitle,
      );
      const exit = panel(doc, id)?.querySelector(".vk-track-exit");
      expect(exit?.textContent ?? null).toBe(
        track.exitCode === null ? null : tracks.exitCode.replace("{code}", String(track.exitCode)),
      );
    }
  });

  it("shows the agents track's .mcp.json in place of a transcript it never recorded", async () => {
    const agents = panel(await render(), "agents");
    expect(LANDING_TRACKS.agents.result).toEqual([]);
    expect(agents?.querySelectorAll(".vk-track-out")).toHaveLength(0);
    const files = Array.from(agents?.querySelectorAll(".vk-track-file") ?? []);
    expect(files.map((file) => file.querySelector("figcaption")?.textContent)).toEqual(
      LANDING_TRACKS.agents.files.map((file) => file.filename),
    );
    expect(files[0]?.querySelector("pre code")?.textContent).toBe(
      LANDING_TRACKS.agents.files[0]?.code.trimEnd(),
    );
    for (const id of ["translate", "ci"] as const) {
      expect(panel(await render(), id)?.querySelector(".vk-track-file")).toBeNull();
    }
  });

  it("explains each track in one sentence and links its docs page", async () => {
    const doc = await render();
    for (const id of LANDING_TRACK_IDS) {
      const summary = panel(doc, id)?.querySelector(".vk-track-summary");
      expect(summary?.textContent).toBe(
        `${tracks[id].summary.replaceAll("`", "")} ${tracks[id].link}`,
      );
      expect(summary?.querySelector("a")?.getAttribute("href")).toBe(LANDING_TRACKS[id].docsPath);
    }
  });

  it("keeps GSAP out of the hero: no static import in the hero or its island", () => {
    for (const file of ["components/landing/hero.tsx", "components/landing/hero-tracks.tsx"]) {
      expect(source(file)).not.toMatch(/from "(gsap|@gsap\/react|@\/lib\/gsap[^"]*)"/);
    }
  });
});

describe("Hero stylesheet", () => {
  it("draws no backdrop pattern and no decorative glow behind the demo column", async () => {
    const doc = await render();
    expect(doc.querySelectorAll(".vk-banner-backdrop")).toHaveLength(0);
    expect(doc.querySelectorAll(".vk-banner-glow")).toHaveLength(0);
  });

  it("declares no glow token or rule and draws no dots", () => {
    const rules = docsStylesheetRules();
    expect(rules.some((rule) => rule.selector.includes(".vk-banner-glow"))).toBe(false);
    expect(
      rules.some((rule) =>
        Object.keys(rule.declarations).some(
          (key) => key.startsWith("--banner-dot") || key === "--banner-glow",
        ),
      ),
    ).toBe(false);
  });

  it("draws the header hairline as one plain border-token line, never a gradient", () => {
    const rules = docsStylesheetRules().filter((rule) => rule.selector === ".vk-header::after");
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.declarations.background).toBe("var(--border-default)");
      expect(rule.declarations.height).toBe("1px");
    }
  });

  it("puts the copy beside the wider tracks column from 64rem", () => {
    const rule = docsStylesheetRules().find(
      (entry) =>
        entry.selector === ".vk-banner-grid" &&
        entry.declarations["grid-template-columns"] === "minmax(0, 5fr) minmax(0, 7fr)",
    );
    expect(rule?.media).toContain("64rem");
  });

  it("stacks the track panels in one cell, so a switch never changes the hero's height", () => {
    const rules = docsStylesheetRules();
    expect(
      rules.find((rule) => rule.selector === '.vk-tracks-panels > [role="tabpanel"]')?.declarations[
        "grid-area"
      ],
    ).toBe("1 / 1");
    expect(
      rules.find((rule) => rule.selector === '.vk-tracks-panels > [data-active="false"]')
        ?.declarations.visibility,
    ).toBe("hidden");
  });
});

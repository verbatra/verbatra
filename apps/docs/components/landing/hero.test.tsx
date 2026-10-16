// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import { HERO_DIFF_SOURCE_PANE, HERO_DIFF_TARGET_PANE } from "@/lib/hero-diff";
import {
  HERO_CHECK_OUTPUT,
  HERO_TERMINAL_SCRIPT,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { nodeVersionsLabel } from "@/lib/node-requirement";
import { RELEASE_BADGE } from "@/lib/release-badge";
import {
  LANDING_LAST_UPDATED,
  MCP_VERSION,
  NODE_RANGE,
  PACKAGE_VERSION,
  STUDIO_VERSION,
} from "@/lib/site";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import messages from "@/messages/en.json";
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
  const { default: catalog } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages: catalog, namespace: namespace as never }),
    getLocale: async () => page.locale,
  };
});

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: catalog } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages: catalog, namespace: namespace as never }),
  };
});

const { Hero, HERO_TITLE_ID } = await import("./hero");

await preloadRegisteredIslands();

async function render(locale = "en"): Promise<Document> {
  page.locale = locale;
  const html = renderToStaticMarkup(await Hero());
  return new DOMParser().parseFromString(html, "text/html");
}

function paintedLines(doc: Document): string[] {
  const screen = doc.querySelector('.vk-banner-terminal [aria-hidden="true"].vk-terminal-scroll');
  const layer = Array.from(screen?.children ?? []).find(
    (child) => !child.classList.contains("invisible"),
  );
  return Array.from(layer?.children ?? [], (line) => line.textContent ?? "");
}

const banner = messages.landing.banner;
const facts = messages.landing.facts;
const marks = messages.landing.showcase.tryIt.marks;

function fact(doc: Document, id: string): Element | null {
  return doc.querySelector(`.vk-facts [data-fact="${id}"]`);
}

describe("Hero", () => {
  it("names its section by the one h1, the headline", async () => {
    const doc = await render();
    const section = doc.querySelector("section");
    const h1s = doc.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(banner.headline);
    expect(h1s[0]?.id).toBe(HERO_TITLE_ID);
    expect(section?.getAttribute("aria-labelledby")).toBe(HERO_TITLE_ID);
    expect(doc.querySelector(".vk-banner-lead")?.textContent).toBe(banner.lead);
  });

  it("opens with an eyebrow that names the category, the license and the audience", async () => {
    const copy = (await render()).querySelector(".vk-banner-copy");
    const eyebrow = copy?.firstElementChild;
    expect(eyebrow?.tagName).toBe("P");
    expect(eyebrow?.className).toBe("vk-banner-eyebrow");
    expect(eyebrow?.textContent).toBe(banner.eyebrow);
    expect(eyebrow?.nextElementSibling?.tagName).toBe("H1");
  });

  it("states the Node.js requirement in the facts block, read from the engines range", async () => {
    const value = fact(await render(), "requirements")?.querySelector("dd");
    const majorFrom = (major: string, minimum: string) =>
      banner.nodeMajorFrom.replace("{major}", major).replace("{minimum}", minimum);
    expect(value?.textContent).toBe(
      banner.nodeRequirement.replace("{versions}", nodeVersionsLabel(NODE_RANGE, "en", majorFrom)),
    );
    expect(value?.textContent).toBe("Requires Node.js 22 (22.18 or later) or 24+");
  });

  it("states what Verbatra is and what it does in two sentences that stand on their own", async () => {
    const summary = (await render()).querySelector(".vk-banner-copy .vk-banner-summary");
    expect(summary?.textContent).toBe(`${banner.quotes.what} ${banner.quotes.how}`);
    for (const sentence of [banner.quotes.what, banner.quotes.how]) {
      expect(sentence).toMatch(/^Verbatra /);
    }
  });

  it("offers Get started to the quickstart and Star on GitHub in a new tab", async () => {
    const links = Array.from((await render()).querySelectorAll(".vk-banner-ctas a"));
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      [banner.ctaPrimary, "/docs/quickstart"],
      [banner.ctaSecondary, GITHUB_URL],
    ]);
    expect(links[1]?.getAttribute("target")).toBe("_blank");
    expect(links[1]?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("prefixes the quickstart link with a non-default locale", async () => {
    const primary = (await render("de")).querySelector(".vk-banner-ctas a");
    expect(primary?.getAttribute("href")).toBe("/de/docs/quickstart");
  });

  it("reuses the copyable install panel, labelled as installing the CLI", async () => {
    const doc = await render();
    const panel = doc.querySelector(".vk-banner-install .vk-command-panel");
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
      banner.installLabel,
    );
    expect(panel?.textContent).toContain(NPM_INSTALL_COMMAND);
  });

  it("paints the finished check run, with its exit code, in the server HTML", async () => {
    const doc = await render();
    expect(paintedLines(doc)).toEqual([
      `$ ${HERO_TERMINAL_SCRIPT[0]?.command}`,
      ...HERO_CHECK_OUTPUT,
      "exit 1",
    ]);
  });

  it("reserves the height of the whole run, so the translate run moves nothing", async () => {
    const reserve = (await render()).querySelector(".vk-banner-terminal .invisible");
    const text = reserve?.textContent ?? "";
    for (const line of [...HERO_CHECK_OUTPUT, ...HERO_TRANSLATE_OUTPUT])
      expect(text).toContain(line.trim());
    expect(text).toContain("exit 0");
  });

  it("gives assistive technology the session summary and every line of both runs", async () => {
    const hidden = (await render()).querySelector(".vk-banner-terminal .sr-only");
    expect(hidden?.textContent).toContain(banner.terminalLabel);
    for (const line of HERO_TRANSLATE_OUTPUT) expect(hidden?.textContent).toContain(line);
  });

  it("draws one dot backdrop and one glow, both decorative", async () => {
    const doc = await render();
    expect(doc.querySelectorAll(".vk-banner-backdrop")).toHaveLength(1);
    expect(doc.querySelectorAll(".vk-banner-glow")).toHaveLength(1);
    for (const layer of doc.querySelectorAll(".vk-banner-backdrop, .vk-banner-glow"))
      expect(layer.getAttribute("aria-hidden")).toBe("true");
  });

  it("takes the dots and the glow from tokens, overridden for the light theme", () => {
    const rules = docsStylesheetRules();
    const backdrop = rules.find((rule) => rule.selector === ".vk-banner-backdrop");
    const glow = rules.find((rule) => rule.selector === ".vk-banner-glow");
    expect(backdrop?.declarations["background-image"]).toContain("var(--banner-dot)");
    expect(glow?.declarations.background).toContain("var(--banner-glow)");
    const light = rules.find(
      (rule) => rule.selector === "html.light" && "--banner-glow" in rule.declarations,
    );
    expect(light?.declarations["--banner-dot"]).toBeDefined();
  });

  it("places the facts block after the visual, so a phone reads it right after the hero", async () => {
    const grid = (await render()).querySelector(".vk-banner-grid");
    expect(Array.from(grid?.children ?? [], (child) => child.className)).toEqual([
      "vk-banner-copy",
      "vk-banner-demo",
      "vk-banner-facts",
    ]);
  });

  it("names the facts list by a visually hidden heading and keeps every fact in text", async () => {
    const doc = await render();
    const list = doc.querySelector("dl.vk-facts");
    const title = doc.getElementById(list?.getAttribute("aria-labelledby") ?? "");
    expect(title?.tagName).toBe("H2");
    expect(title?.className).toBe("sr-only");
    expect(title?.textContent).toBe(facts.label);
    expect(Array.from(list?.querySelectorAll("dt") ?? [], (term) => term.textContent)).toEqual([
      facts.license,
      facts.install,
      facts.providers,
      facts.formats,
      facts.requirements,
      facts.version,
      facts.lastUpdated,
    ]);
    expect(list?.querySelector("img, svg, canvas")).toBeNull();
  });

  it("states the MIT license and the install command", async () => {
    const doc = await render();
    const license = fact(doc, "license")?.querySelector("a");
    expect(license?.textContent).toContain("MIT");
    expect(license?.getAttribute("href")).toBe(
      "https://github.com/verbatra/verbatra/blob/main/LICENSE",
    );
    expect(license?.getAttribute("target")).toBe("_blank");
    expect(fact(doc, "install")?.querySelector("code")?.textContent).toBe(NPM_INSTALL_COMMAND);
  });

  it("lists every machine provider, badging only the ones the release badge names", async () => {
    const items = Array.from(fact(await render(), "providers")?.querySelectorAll("li") ?? []);
    expect(items.map((item) => item.getAttribute("data-provider"))).toEqual([
      ...MACHINE_PROVIDER_IDS,
    ]);
    const badged = items.filter((item) => item.querySelector(".vk-pill") !== null);
    expect(badged.map((item) => item.getAttribute("data-provider"))).toEqual([
      ...RELEASE_BADGE.providers,
    ]);
    for (const item of badged) {
      expect(item.querySelector(".vk-pill")?.textContent).toBe(
        facts.availableFrom.replace("{version}", RELEASE_BADGE.version),
      );
    }
  });

  it("counts the formats from the registry and links the providers and formats pages", async () => {
    const doc = await render("de");
    const links = Array.from(
      doc.querySelectorAll(
        '.vk-facts [data-fact="providers"] a, .vk-facts [data-fact="formats"] a',
      ),
      (link) => link.getAttribute("href"),
    );
    expect(links).toEqual(["/de/docs/providers", "/de/docs/formats"]);
    expect(fact(await render(), "formats")?.textContent).toContain(
      facts.formatsValue.replace("{count}", String(SUPPORTED_FORMAT_IDS.length)),
    );
  });

  it("shows the published versions and the landing date", async () => {
    const doc = await render();
    const version = fact(doc, "version")?.querySelector("dd")?.textContent ?? "";
    expect(version).toContain(`v${PACKAGE_VERSION}`);
    expect(version).toContain(STUDIO_VERSION);
    expect(version).toContain(MCP_VERSION);
    const time = fact(doc, "updated")?.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(LANDING_LAST_UPDATED);
    expect(time?.textContent).toBe("October 16, 2026");
  });

  it("draws both locale files exactly as the adapter wrote them, filled in the server HTML", async () => {
    const doc = await render();
    const panes = Array.from(doc.querySelectorAll(".vk-hero-diff-pane"));
    expect(panes.map((pane) => pane.querySelector("figcaption")?.textContent)).toEqual([
      HERO_DIFF_SOURCE_PANE.file,
      HERO_DIFF_TARGET_PANE.file,
    ]);
    const code = (index: number) =>
      Array.from(
        panes[index]?.querySelectorAll(".vk-showcase-line") ?? [],
        (line) => line.querySelector("code")?.textContent ?? "",
      );
    expect(code(0)).toEqual(HERO_DIFF_SOURCE_PANE.lines.map((line) => line.text));
    expect(code(1)).toEqual(HERO_DIFF_TARGET_PANE.lines.map((line) => line.text));
    expect(doc.querySelector("[data-diff-state]")?.getAttribute("data-diff-state")).toBe("filled");
    expect(doc.querySelector(".vk-hero-diff")?.getAttribute("aria-label")).toBe(banner.diffLabel);
  });

  it("marks the filled keys of the German file, keeping the missing mark from assistive technology", async () => {
    const doc = await render();
    const filled = Array.from(doc.querySelectorAll(".vk-hero-diff-line"));
    expect(filled.map((line) => line.getAttribute("data-fill"))).toEqual([
      "checkout.title",
      "checkout.pay",
    ]);
    for (const line of filled) {
      expect(line.getAttribute("data-mark")).toBe("new");
      expect(line.querySelector(".vk-hero-diff-mark-filled")?.textContent).toBe(marks.new);
      const missing = line.querySelector(".vk-hero-diff-mark-missing");
      expect(missing?.textContent).toBe(marks.missing);
      expect(missing?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(doc.querySelectorAll(".vk-hero-diff .vk-placeholder").length).toBeGreaterThan(0);
  });
});

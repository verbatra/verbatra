// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import { HERO_DIFF_SOURCE_PANE, HERO_DIFF_TARGET_PANE } from "@/lib/hero-diff";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { pendingProviders, publishedProviders } from "@/lib/landing-faq";
import { nodeVersionsLabel } from "@/lib/node-requirement";
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
    getTranslations: async (scope: string | { namespace: string }) =>
      createTranslator({
        locale: "en",
        messages: catalog,
        namespace: (typeof scope === "string" ? scope : scope.namespace) as never,
      }),
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

  it("opens the copy with the h1, with no eyebrow line above it", async () => {
    const copy = (await render()).querySelector(".vk-banner-copy");
    expect(copy?.firstElementChild?.tagName).toBe("H1");
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
      [`${banner.ctaSecondary} ${messages.landing.openSource.newTab}`, GITHUB_URL],
    ]);
    expect(links[1]?.getAttribute("target")).toBe("_blank");
    expect(links[1]?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("prefixes the quickstart link with a non-default locale", async () => {
    const primary = (await render("de")).querySelector(".vk-banner-ctas a");
    expect(primary?.getAttribute("href")).toBe("/de/docs/quickstart");
  });

  it("reuses the copyable install panel under the diff, labelled as installing the CLI", async () => {
    const doc = await render();
    const install = doc.querySelector(".vk-banner-demo > .vk-banner-install");
    expect(install?.previousElementSibling?.className).toBe("vk-hero-diff");
    expect(doc.querySelector(".vk-banner-copy .vk-banner-install")).toBeNull();
    const panel = install?.querySelector(".vk-command-panel");
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
      banner.installLabel,
    );
    expect(panel?.textContent).toContain(NPM_INSTALL_COMMAND);
  });

  it("draws no terminal: the diff and its caption carry the translate run", async () => {
    const doc = await render();
    expect(doc.querySelector(".vk-terminal, .vk-banner-terminal")).toBeNull();
    const code = doc.querySelector(".vk-hero-diff-caption code");
    expect(code?.textContent).toBe("verbatra translate");
    expect(doc.querySelector(".vk-hero-diff-caption")?.textContent).toBe(
      banner.diffLabel.replaceAll("`", ""),
    );
  });

  it("draws no backdrop pattern and one decorative glow behind the demo column", async () => {
    const doc = await render();
    expect(doc.querySelectorAll(".vk-banner-backdrop")).toHaveLength(0);
    const glows = doc.querySelectorAll(".vk-banner-glow");
    expect(glows).toHaveLength(1);
    expect(glows[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(glows[0]?.parentElement?.className).toBe("vk-banner-demo");
  });

  it("takes the glow from a token, overridden for the light theme, and draws no dots", () => {
    const rules = docsStylesheetRules();
    const glow = rules.find((rule) => rule.selector === ".vk-banner-glow");
    expect(glow?.declarations.background).toContain("var(--banner-glow)");
    const light = rules.find(
      (rule) => rule.selector === "html.light" && "--banner-glow" in rule.declarations,
    );
    expect(light).toBeDefined();
    expect(
      rules.some((rule) =>
        Object.keys(rule.declarations).some((key) => key.startsWith("--banner-dot")),
      ),
    ).toBe(false);
  });

  it("runs the facts across both columns from 64rem", () => {
    const rule = docsStylesheetRules().find(
      (entry) =>
        entry.selector === ".vk-banner-grid" &&
        entry.declarations["grid-template-areas"]?.includes("facts facts"),
    );
    expect(rule?.media).toContain("64rem");
  });

  it("places the facts block after the visual, so a phone reads it right after the hero", async () => {
    const grid = (await render()).querySelector(".vk-banner-grid");
    expect(Array.from(grid?.children ?? [], (child) => child.className)).toEqual([
      "vk-banner-copy",
      "vk-banner-demo",
      "vk-banner-facts",
    ]);
  });

  it("heads the facts list with a visually hidden h2 and keeps every fact in text", async () => {
    const doc = await render();
    const list = doc.querySelector("dl.vk-facts");
    expect(list?.hasAttribute("aria-labelledby")).toBe(false);
    expect(list?.hasAttribute("aria-label")).toBe(false);
    const title = list?.previousElementSibling;
    expect(title?.tagName).toBe("H2");
    expect(title?.className).toBe("sr-only");
    expect(title?.textContent).toBe(facts.label);
    expect(Array.from(list?.querySelectorAll("dt") ?? [], (term) => term.textContent)).toEqual([
      facts.license,
      facts.providers,
      facts.formats,
      facts.requirements,
      facts.version,
      facts.lastUpdated,
    ]);
    expect(list?.querySelector("img, svg, canvas")).toBeNull();
  });

  it("states the MIT license and leaves the install command to the command panel", async () => {
    const doc = await render();
    const license = fact(doc, "license")?.querySelector("a");
    expect(license?.textContent).toContain("MIT");
    expect(license?.getAttribute("href")).toBe(
      "https://github.com/verbatra/verbatra/blob/main/LICENSE",
    );
    expect(license?.getAttribute("target")).toBe("_blank");
    expect(fact(doc, "install")).toBeNull();
    expect(doc.querySelector(".vk-facts")?.textContent).not.toContain(NPM_INSTALL_COMMAND);
  });

  it("counts the machine providers in digits and links the providers page, with no list or badge", async () => {
    const providers = fact(await render(), "providers");
    expect(providers?.querySelector("dd")?.textContent).toBe(
      `${facts.providersValue.replace("{count}", String(publishedProviders(PACKAGE_VERSION).length))}${facts.providersLink}`,
    );
    expect(providers?.textContent).toMatch(/\d/);
    expect(providers?.querySelector("ul, li, .vk-pill")).toBeNull();
  });

  it("counts only the providers the published version ships, since the fact carries no badge", async () => {
    const providers = fact(await render(), "providers");
    const shipped = MACHINE_PROVIDER_IDS.length - pendingProviders(PACKAGE_VERSION).length;
    expect(providers?.querySelector("dd span")?.textContent).toBe(
      facts.providersValue.replace("{count}", String(shipped)),
    );
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
    expect(version).toBe(
      facts.versionParts
        .replace("{cli}", PACKAGE_VERSION)
        .replace("{studio}", STUDIO_VERSION)
        .replace("{mcp}", MCP_VERSION),
    );
    expect(version).toContain(`CLI and SDK v${PACKAGE_VERSION}`);
    const time = fact(doc, "updated")?.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(LANDING_LAST_UPDATED);
    expect(time?.textContent).toBe("October 17, 2026");
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
    const figure = doc.querySelector(".vk-hero-diff");
    expect(figure?.hasAttribute("aria-label")).toBe(false);
    const caption = figure?.querySelector(":scope > figcaption");
    expect(caption?.className).toBe("vk-hero-diff-caption");
    expect(caption?.textContent).toBe(banner.diffLabel.replaceAll("`", ""));
  });

  it("marks each pane's code with its file's language and the mark words with the page's", async () => {
    const doc = await render("de");
    const blocks = Array.from(doc.querySelectorAll(".vk-hero-diff-pane [role='group']"));
    expect(blocks.map((block) => block.getAttribute("lang"))).toEqual(["en", "de"]);
    expect(blocks.every((block) => !block.classList.contains("vk-hero-diff-scroll"))).toBe(true);
    for (const mark of doc.querySelectorAll(".vk-hero-diff-mark"))
      expect(mark.getAttribute("lang")).toBe("de");
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

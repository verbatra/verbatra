// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import {
  HERO_CHECK_OUTPUT,
  HERO_TERMINAL_SCRIPT,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { nodeVersionsLabel } from "@/lib/node-requirement";
import { NODE_RANGE } from "@/lib/site";
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

  it("states the Node.js requirement under the install command, read from the engines range", async () => {
    const note = (await render()).querySelector(".vk-banner-install .vk-banner-requirement");
    expect(note?.textContent).toBe(
      banner.nodeRequirement.replace("{versions}", nodeVersionsLabel(NODE_RANGE, "en")),
    );
  });

  it("offers Get started to the quickstart and View on GitHub in a new tab", async () => {
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
});

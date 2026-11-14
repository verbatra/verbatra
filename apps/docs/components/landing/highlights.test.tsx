// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { HERO_CHECK_BADGE } from "@/lib/hero-terminal";
import {
  CLI_LINES,
  MCP_CALL,
  MCP_RESPONSE_LINES,
  RAIL_ENTRIES,
  SDK_CALL_LINES,
  SDK_RESULT_LINES,
  STUDIO_COLUMNS,
  STUDIO_ROW,
  SURFACE_COUNTS,
  surfaceText,
} from "@/lib/highlights-surfaces";
import { MCP_ADD_COMMAND } from "@/lib/install-commands";
import { LOCK_FILE_NAME } from "@/lib/lock-demo";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

const rendering = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: en } = await import("@/messages/en.json");
  const { default: de } = await import("@/messages/de.json");
  const catalogs: Record<string, typeof en> = { en, de };
  return {
    getLocale: async () => rendering.locale,
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: rendering.locale,
        messages: catalogs[rendering.locale] ?? en,
        namespace: namespace as never,
      }),
  };
});

const { Highlights } = await import("./highlights");

await preloadRegisteredIslands();

let root: HTMLElement;

async function renderIn(locale: string): Promise<HTMLElement> {
  rendering.locale = locale;
  const element = document.createElement("div");
  element.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "de" ? de : en}>
      {await Highlights()}
    </NextIntlClientProvider>,
  );
  rendering.locale = "en";
  return element;
}

beforeAll(async () => {
  root = await renderIn("en");
});

function panes(): Element[] {
  return Array.from(root.querySelectorAll(".vk-hl-panes > article.vk-hl-pane"));
}

describe("Highlights", () => {
  it("keeps the section id and names it by a heading with no trailing period", () => {
    const section = root.querySelector("section#highlights");
    expect(section?.getAttribute("aria-labelledby")).toBe("highlights-heading");
    expect(root.querySelector("h2#highlights-heading")?.textContent).toBe(
      "Ask any surface, get the same answer",
    );
  });

  it("states the dataset from the fixture in the lead, naming the four surfaces and the one lock file", () => {
    const lead = root.querySelector(".vk-section-head-lead")?.textContent ?? "";
    expect(lead).toBe(
      `The CLI, the SDK, Studio and the MCP server all read one lock file, so ${SURFACE_COUNTS.locale} reads ${SURFACE_COUNTS.stale} stale and ${SURFACE_COUNTS.upToDate} up-to-date wherever you ask.`,
    );
    expect(SURFACE_COUNTS).toMatchObject({
      locale: "de",
      missing: 0,
      stale: 2,
      upToDate: 12,
      total: 14,
    });
  });

  it("shows a slim lock file rail with the two stale entries and the check badge", () => {
    const rail = root.querySelector(".vk-hl-rail");
    expect(rail?.querySelector(".vk-lock-head")?.textContent).toBe(
      `${LOCK_FILE_NAME} ${HERO_CHECK_BADGE}`,
    );
    const lines = Array.from(rail?.querySelectorAll(".vk-lock-line[data-mark='stale']") ?? []);
    expect(lines).toHaveLength(SURFACE_COUNTS.stale);
    expect(lines.map((line) => line.querySelector(".vk-lock-key")?.textContent)).toEqual(
      RAIL_ENTRIES.map(({ key }) => JSON.stringify(key)),
    );
    expect(rail?.querySelectorAll(".vk-lock-tag")[0]?.textContent).toBe("stale");
  });

  it("sets four panes in the order CLI, Studio, SDK, MCP server, each naming its surface in an h3", () => {
    expect(panes().map((pane) => pane.querySelector("h3")?.textContent)).toEqual([
      "CLI",
      "Studio",
      "SDK",
      "MCP server",
    ]);
    for (const pane of panes()) {
      const title = pane.querySelector("h3");
      expect(pane.getAttribute("aria-labelledby")).toBe(title?.id);
      expect(pane.querySelector(".vk-lock-card .vk-lock-head")).not.toBeNull();
    }
  });

  it("gives each pane one docs link to a path that exists, localized", () => {
    const hrefs = panes().map((pane) => {
      const links = pane.querySelectorAll("a");
      expect(links).toHaveLength(1);
      return links[0]?.getAttribute("href");
    });
    expect(hrefs).toEqual([
      "/docs/cli/check",
      "/docs/cli/studio",
      "/docs/sdk/inspect",
      "/docs/cli/mcp",
    ]);
    for (const href of hrefs) {
      const slug = (href ?? "").replace("/docs/", "");
      expect(
        readFileSync(join(process.cwd(), "content/docs", `${slug}.mdx`), "utf8").length,
      ).toBeGreaterThan(0);
    }
  });

  it("prints each pane's code from the pinned data, the stale field marked at rest", () => {
    const text = (index: number) => panes()[index]?.querySelector("pre")?.textContent ?? "";
    expect(text(0)).toBe(surfaceText(CLI_LINES));
    expect(text(2)).toBe(surfaceText([...SDK_CALL_LINES, ...SDK_RESULT_LINES]));
    expect(text(3)).toBe(surfaceText([{ text: MCP_CALL }, ...MCP_RESPONSE_LINES]));
    expect(root.querySelectorAll(".vk-hl-pane .vk-hl-stale")).toHaveLength(4);
    for (const mark of root.querySelectorAll(".vk-hl-pane .vk-hl-stale"))
      expect(mark.textContent).toMatch(new RegExp(`\\b${SURFACE_COUNTS.stale}\\b`));
  });

  it("draws the Studio Locales row with the coverage rule, no fake links and no lock column", () => {
    const studio = panes()[1];
    expect(Array.from(studio?.querySelectorAll("th") ?? [], (cell) => cell.textContent)).toEqual([
      ...STUDIO_COLUMNS,
    ]);
    expect(Array.from(studio?.querySelectorAll("td") ?? [], (cell) => cell.textContent)).toEqual([
      "de",
      `${STUDIO_ROW.percent}% ${STUDIO_ROW.keys}`,
      "0",
      "2",
      "12",
    ]);
    expect(studio?.querySelectorAll("a")).toHaveLength(1);
    expect(studio?.textContent).not.toMatch(/Drift|Open|Lock/);
    expect(studio?.querySelector(".vk-hl-bar i")?.getAttribute("style")).toContain(
      `--vk-hl-fill:${STUDIO_ROW.percent / 100}`,
    );
  });

  it("puts the MCP setup command in the pane with the real copy control", () => {
    const mcp = panes()[3];
    expect(mcp?.querySelector(".vk-hl-command code")?.textContent).toBe(MCP_ADD_COMMAND);
    const button = mcp?.querySelector(".vk-hl-foot button");
    expect(button?.getAttribute("aria-label")).toBe(en.landing.highlights.mcp.copyAria);
    expect(button?.textContent).toBe(en.landing.install.copy);
    expect(mcp?.querySelector(".vk-lock-head")?.textContent).toContain("calls no provider");
    expect(root.querySelectorAll("button")).toHaveLength(1);
  });

  it("keeps up-to-date whole wherever the section prints it", () => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let found = 0;
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (!(node.textContent ?? "").includes("up-to-date")) continue;
      found += 1;
      expect(
        node.parentElement?.closest(".whitespace-nowrap"),
        node.textContent ?? "",
      ).not.toBeNull();
    }
    expect(found).toBeGreaterThanOrEqual(3);
  });

  it.each(["en", "de", "es", "fr"])(
    "names the %s copy button with its visible word, so the label matches the content",
    (locale) => {
      const catalog = JSON.parse(
        readFileSync(join(process.cwd(), `messages/${locale}.json`), "utf8"),
      ) as typeof en;
      expect(catalog.landing.highlights.mcp.copyAria.toLowerCase()).toContain(
        catalog.landing.install.copy.toLowerCase(),
      );
    },
  );

  it("makes no pane a tab stop and puts no tabindex span in the section", () => {
    expect(root.querySelector("[tabindex]")).toBeNull();
  });

  it("reveals the panes by row, not by position: 0 for the first row and 1 for the second", () => {
    expect(panes().map((pane) => pane.getAttribute("data-reveal"))).toEqual(["0", "0", "1", "1"]);
    expect(root.querySelector("section")?.hasAttribute("data-reveal")).toBe(false);
    expect(root.querySelector(".vk-section-head [data-reveal]")).toBeNull();
  });

  it("keeps the CLI text English on a German page and translates only the surface names", async () => {
    const german = await renderIn("de");
    expect(german.querySelector("section h2")?.textContent).toBe(de.landing.highlights.heading);
    const german3 = Array.from(german.querySelectorAll("h3"), (h) => h.textContent);
    expect(german3).toEqual([
      de.landing.highlights.surfaces.cli,
      de.landing.highlights.surfaces.studio,
      de.landing.highlights.surfaces.sdk,
      de.landing.highlights.surfaces.mcp,
    ]);
    for (const pre of german.querySelectorAll("pre")) expect(pre.getAttribute("lang")).toBe("en");
    expect(german.querySelector("a")?.getAttribute("href")).toBe("/de/docs/cli/check");
  });
});

describe("Highlights stylesheet", () => {
  const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

  function rule(selector: string): string {
    const start = css.indexOf(`\n${selector} {`);
    expect(start, selector).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("\n}", start));
  }

  it("opens the content one head gap under the head and sets two columns from 40rem", () => {
    expect(rule(".vk-hl")).toContain("margin-top: var(--head-gap);");
    expect(css).toMatch(
      /@media \(min-width: 40rem\) \{\s+\.vk-hl-panes \{\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });

  it("lights every stale field from a hovered or focused pane through :has(), never a tabindex", () => {
    const trigger = ".vk-hl:has(.vk-hl-pane:hover, .vk-hl-pane:focus-within)";
    expect(css).toContain(`${trigger} .vk-hl-stale {`);
    expect(css).toContain(`${trigger} .vk-lock-line[data-mark] {`);
    expect(css).toMatch(/\.vk-hl-stale \{[^}]*color: var\(--accent\);/);
  });

  it("fades the highlight over --duration-fast, only where motion is welcome, and animates no layout", () => {
    const motion = css.slice(
      css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  .vk-hl .vk-hl-stale"),
    );
    const block = motion.slice(0, motion.indexOf("\n}\n"));
    expect(block).toContain("background-color var(--duration-fast) var(--ease-standard)");
    expect(block).not.toMatch(/\b(width|height|margin|padding|top|left)\b/);
  });

  it("outlines the lit field under forced colors", () => {
    expect(css).toMatch(
      /@media \(forced-colors: active\) \{\s+\.vk-hl:has\([^{]*\.vk-hl-stale \{\s+outline: 2px solid Highlight;/,
    );
  });

  it("draws the coverage bar with a transform scale and no literal colour", () => {
    expect(rule(".vk-hl-bar i")).toContain("transform: scaleX(var(--vk-hl-fill));");
    const block = css.slice(css.indexOf(".vk-hl {"), css.indexOf(".vk-deck {"));
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|hsl\(|rgb\(/i);
    expect(block).not.toContain("--status-warning");
  });

  it("leaves no bento or tile rule behind", () => {
    expect(css).not.toMatch(/\.vk-bento|\.vk-tile|vk-highlight-placeholder/);
  });
});

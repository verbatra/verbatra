// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GATE_KEY } from "@/lib/gate-demo";
import {
  CLI_LINES,
  LOCK_STATE_STALE,
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
import { MCP_ADD_COMMAND, SDK_INSTALL_COMMAND } from "@/lib/install-commands";
import type { Locale } from "@/lib/locales";
import { LOCALES } from "@/lib/locales";
import { LOCK_FILE_NAME } from "@/lib/lock-demo";
import { MESSAGE_CATALOGS, type Messages } from "@/lib/message-catalogs";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import en from "@/messages/en.json";
import { cssBlock, literalColours } from "@/test-support/css-block";
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
    <NextIntlClientProvider locale={locale} messages={locale === "de" ? MESSAGE_CATALOGS.de : en}>
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

const CATALOG_ENTRIES = Object.entries(MESSAGE_CATALOGS) as [Locale, Messages][];

describe("Highlights", () => {
  it("keeps the section id and names it by a heading with no trailing period", () => {
    const section = root.querySelector("section#highlights");
    expect(section?.getAttribute("aria-labelledby")).toBe("highlights-heading");
    expect(root.querySelector("h2#highlights-heading")?.textContent).toBe(
      "Ask any surface, get the same answer",
    );
  });

  it("states the dataset from the fixture in the lead, naming the one lock file and the language", () => {
    const lead = root.querySelector(".vk-section-head-lead")?.textContent ?? "";
    expect(lead).toBe(
      `Every surface reads one lock file, so with profile.greeting refused, German reads ${SURFACE_COUNTS.stale} stale and ${SURFACE_COUNTS.upToDate} up-to-date wherever you ask.`,
    );
    expect(SURFACE_COUNTS).toMatchObject({
      locale: "de",
      missing: 0,
      stale: 1,
      upToDate: 13,
      total: 14,
    });
  });

  it.each(CATALOG_ENTRIES)(
    "names the language of the fixture in the %s lead and never its locale code",
    (locale, catalog) => {
      const lead = createTranslator({
        locale,
        messages: catalog,
        namespace: "landing.highlights",
      })("lead", { stale: SURFACE_COUNTS.stale, upToDate: SURFACE_COUNTS.upToDate });
      const language = new Intl.DisplayNames([locale], { type: "language" }).of(
        SURFACE_COUNTS.locale,
      );
      expect(language).toBeTruthy();
      expect(lead).toContain(language as string);
      expect(lead).toContain(GATE_KEY);
      expect(catalog.landing.highlights.lead).not.toContain("{locale}");
    },
  );

  it("shows a slim lock file rail with the one stale entry and the badge the counts give", () => {
    const rail = root.querySelector(".vk-hl-rail");
    expect(rail?.querySelector(".vk-lock-head")?.textContent).toBe(
      `${LOCK_FILE_NAME} 1 stale, 13 up-to-date`,
    );
    const lines = Array.from(rail?.querySelectorAll(".vk-lock-line[data-mark='stale']") ?? []);
    expect(lines).toHaveLength(SURFACE_COUNTS.stale);
    expect(lines.map((line) => line.querySelector(".vk-lock-key")?.textContent)).toEqual(
      RAIL_ENTRIES.map(({ key }) => JSON.stringify(key)),
    );
    for (const tag of rail?.querySelectorAll(".vk-lock-tag") ?? []) {
      expect(tag.textContent).toBe(LOCK_STATE_STALE);
      expect(tag.getAttribute("lang")).toBe("en");
    }
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
      const glow = pane.querySelectorAll(":scope > .vk-hl-glow");
      expect(glow).toHaveLength(1);
      expect(glow[0]?.getAttribute("aria-hidden")).toBe("true");
      expect(glow[0]?.textContent).toBe("");
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
      "1",
      "13",
    ]);
    expect(studio?.querySelectorAll("a")).toHaveLength(1);
    expect(studio?.textContent).not.toMatch(/Drift|Open|Lock/);
    expect(studio?.querySelector(".vk-hl-bar i")?.getAttribute("style")).toContain(
      `--vk-hl-fill:${STUDIO_ROW.percent / 100}`,
    );
  });

  it("puts the setup command of the SDK and of the MCP server in their panes with the real copy control", () => {
    const mcp = panes()[3];
    expect(mcp?.querySelector(".vk-hl-command code")?.textContent).toBe(MCP_ADD_COMMAND);
    const button = mcp?.querySelector(".vk-hl-foot button");
    expect(button?.getAttribute("aria-label")).toBe(en.landing.highlights.mcp.copyAria);
    expect(button?.textContent).toBe(en.landing.install.copy);
    expect(mcp?.querySelector(".vk-lock-head")?.textContent).toContain("calls no provider");
    const sdk = panes()[2];
    expect(sdk?.querySelector(".vk-hl-command code")?.textContent).toBe(SDK_INSTALL_COMMAND);
    expect(sdk?.querySelector(".vk-hl-foot button")?.getAttribute("aria-label")).toBe(
      en.landing.highlights.sdk.copyAria,
    );
    expect(root.querySelectorAll("button")).toHaveLength(2);
  });

  it("marks the English badges lang=en and leaves the translated MCP badge to the page", () => {
    const badges = panes().map((pane) => pane.querySelector(".vk-lock-head .vk-lock-badge"));
    expect(badges.map((badge) => badge?.getAttribute("lang"))).toEqual(["en", "en", "en", null]);
  });

  it("names the Studio table by a translated group and keeps its cells in English", async () => {
    const figure = panes()[1]?.querySelector("figure");
    expect(figure?.querySelector("figcaption")?.textContent).toBe("Locale coverage");
    expect(figure?.hasAttribute("lang")).toBe(false);
    expect(figure?.querySelector("table")?.getAttribute("lang")).toBe("en");
    expect(figure?.querySelector("table")?.hasAttribute("aria-label")).toBe(false);
    const german = await renderIn("de");
    expect(german.querySelector("figure figcaption")?.textContent).toBe(
      MESSAGE_CATALOGS.de.landing.highlights.studio.label,
    );
  });

  it.each(CATALOG_ENTRIES)(
    "capitalises every %s surface name and uses one word for the provider",
    (_locale, catalog) => {
      for (const name of Object.values(catalog.landing.highlights.surfaces))
        expect(name.charAt(0)).toBe(name.charAt(0).toUpperCase());
      expect(catalog.landing.highlights.mcp.badge).not.toMatch(/Provider/);
    },
  );

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

  it.each(LOCALES)(
    "names the %s copy button with its visible word, so the label matches the content",
    (locale) => {
      const catalog = JSON.parse(
        readFileSync(join(process.cwd(), `messages/${locale}.json`), "utf8"),
      ) as typeof en;
      for (const aria of [
        catalog.landing.highlights.mcp.copyAria,
        catalog.landing.highlights.sdk.copyAria,
      ])
        expect(aria.toLowerCase()).toContain(catalog.landing.install.copy.toLowerCase());
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
    expect(german.querySelector("section h2")?.textContent).toBe(
      MESSAGE_CATALOGS.de.landing.highlights.heading,
    );
    const german3 = Array.from(german.querySelectorAll("h3"), (h) => h.textContent);
    expect(german3).toEqual([
      MESSAGE_CATALOGS.de.landing.highlights.surfaces.cli,
      MESSAGE_CATALOGS.de.landing.highlights.surfaces.studio,
      MESSAGE_CATALOGS.de.landing.highlights.surfaces.sdk,
      MESSAGE_CATALOGS.de.landing.highlights.surfaces.mcp,
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

  it("lights every stale field from a hovered or focused pane or the hovered rail through :has(), never a tabindex", () => {
    const trigger = ".vk-hl:has(.vk-hl-pane:hover, .vk-hl-pane:focus-within, .vk-hl-rail:hover)";
    const rules = docsStylesheetRules();
    const exact = (selector: string) => rules.filter((rule) => rule.selector === selector);
    expect(exact(`${trigger} .vk-hl-stale`)).not.toHaveLength(0);
    expect(exact(`${trigger} .vk-lock-line[data-mark]`)).not.toHaveLength(0);
    const rail = rules.find(
      (rule) =>
        rule.selector.includes(`${trigger} .vk-hl-rail .vk-lock-value`) &&
        rule.selector.includes(`${trigger} .vk-hl-rail .vk-lock-sign`),
    );
    expect(rail?.declarations.color).toBe("var(--text-strong)");
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

  it("sets the stale field on a radius token and keeps the bar at every container width", () => {
    expect(rule(".vk-hl-stale")).toContain("border-radius: var(--radius-sm);");
    const narrow = cssBlock(css, "@container (max-width: 24rem) {", "\n}\n");
    expect(narrow).toContain(".vk-hl-keys {");
    expect(narrow).not.toMatch(/\.vk-hl-bar[^{]*\{\s+display: none/);
  });

  it("outlines the lit field under forced colors", () => {
    const lit = docsStylesheetRules()
      .filter(
        (rule) =>
          rule.selector ===
          ".vk-hl:has(.vk-hl-pane:hover, .vk-hl-pane:focus-within, .vk-hl-rail:hover) .vk-hl-stale",
      )
      .find((rule) => rule.media === "@media (forced-colors: active)");
    expect(lit?.declarations.outline).toBe("2px solid Highlight");
    const forced = cssBlock(css, "@media (forced-colors: active) {\n  .vk-hl-bar {", "\n}\n");
    expect(forced).toContain("border: 1px solid CanvasText;");
    expect(forced).toContain("background: Highlight;");
  });

  it("draws the coverage bar with a transform scale and no literal colour", () => {
    expect(rule(".vk-hl-bar i")).toContain("transform: scaleX(var(--vk-hl-fill));");
    const block = cssBlock(css, "\n.vk-hl {", "\n.vk-gate-track {");
    expect(block.length).toBeGreaterThan(2000);
    expect(block).toContain(".vk-hl-bar i {");
    expect(literalColours(block)).toEqual([]);
    expect(block).not.toContain("--status-warning");
  });

  it("leaves no bento or tile rule behind", () => {
    expect(css).not.toMatch(/\.vk-bento|\.vk-tile|vk-highlight-placeholder/);
  });
});

describe("Highlights lit pane (D17)", () => {
  const rules = docsStylesheetRules();
  const LIT = "article.vk-hl-pane:is(:hover, :focus-within) > .vk-lock-card";
  const exact = (selector: string) => rules.filter((rule) => rule.selector === selector);
  const LIFT_MEDIA = "@media (hover: hover) and (prefers-reduced-motion: no-preference)";

  it("lifts the inner card 4px with transform only inside both media gates", () => {
    const lifted = exact(LIT).filter((rule) => "transform" in rule.declarations);
    expect(lifted.map((rule) => [rule.media, rule.declarations.transform])).toEqual([
      [LIFT_MEDIA, "translateY(calc(-1 * var(--motion-distance-sm)))"],
    ]);
    expect(exact("article.vk-hl-pane:is(:hover, :focus-within)")).toEqual([]);
  });

  it("mirrors :hover with :focus-within and moves the card, never the article", () => {
    const moving = rules.filter((rule) => "transform" in rule.declarations);
    expect(moving.filter((rule) => rule.selector.includes(".vk-hl-pane:is(")).length).toBe(1);
    for (const rule of rules.filter((r) => r.selector.includes(".vk-hl-pane:hover"))) {
      expect(rule.selector).toContain(".vk-hl-pane:focus-within");
    }
    expect(rulesFor(rules, ".vk-hl-pane")[0]?.declarations.transform).toBeUndefined();
  });

  it("sets the lit border to --accent and fades a neutral shadow layer by opacity alone", () => {
    expect(exact(LIT)[0]?.declarations["border-color"]).toBe("var(--accent)");
    const shadow = rulesFor(rules, ".vk-hl-glow")[0];
    expect(shadow?.declarations["box-shadow"]).toBe("var(--shadow-panel)");
    expect(shadow?.declarations.opacity).toBe("0");
    expect(
      exact("article.vk-hl-pane:is(:hover, :focus-within) > .vk-hl-glow")[0]?.declarations.opacity,
    ).toBe("1");
  });

  it("never animates a box-shadow: the lit card's own shadow is the same at rest and lit", () => {
    for (const rule of rules.filter((r) => "transition" in r.declarations)) {
      if (!/\.vk-hl-(pane|glow)/.test(rule.selector)) continue;
      expect(rule.declarations.transition, rule.selector).not.toContain("box-shadow");
    }
    expect(
      rules.filter((rule) => rule.selector.includes(LIT) && "box-shadow" in rule.declarations),
    ).toEqual([]);
  });

  it("keeps the shadow layer out of the guide line pseudos and paints no shadow on the stub", () => {
    for (const rule of rules.filter((r) =>
      /\.vk-hl-pane(:nth-child\([a-z0-9]+\))?::before/.test(r.selector),
    ))
      expect(rule.declarations.opacity === "0" || "box-shadow" in rule.declarations).toBe(false);
  });

  it("transitions only transform, opacity and the border colour, under no-preference and a hover device", () => {
    const transitions = rules
      .filter(
        (rule) => /\.vk-hl-(pane|glow)/.test(rule.selector) && "transition" in rule.declarations,
      )
      .filter((rule) => rule.declarations.transition !== "none");
    expect(transitions.map((rule) => rule.media)).toEqual([LIFT_MEDIA, LIFT_MEDIA]);
    for (const rule of transitions) {
      const properties = (rule.declarations.transition ?? "")
        .split(/,\s*/)
        .map((part) => part.split(" ")[0]);
      expect(
        properties.every((p) => ["transform", "opacity", "border-color"].includes(p ?? "")),
      ).toBe(true);
    }
  });

  it("prints the shadow layer empty and at full opacity", () => {
    const print = rulesFor(rules, ".vk-hl-glow").find((rule) => rule.media === "@media print");
    expect(print?.declarations["box-shadow"]).toBe("none");
    expect(print?.declarations.opacity).toBe("1");
    expect(print?.declarations.transition).toBe("none");
  });

  it("outlines the lit card with Highlight under forced colors", () => {
    const outline = exact(LIT).find((rule) => rule.media === "@media (forced-colors: active)");
    expect(outline?.declarations.outline).toBe("2px solid Highlight");
  });

  it("adds no client code and no tabindex to the section", () => {
    const source = readFileSync(join(process.cwd(), "components/landing/highlights.tsx"), "utf8");
    expect(source.startsWith('"use client"')).toBe(false);
    expect(source).not.toMatch(/tabIndex|onPointer|onMouse|addEventListener/);
  });
});

describe("Highlights zig-zag guide line (D18 A)", () => {
  const rules = docsStylesheetRules();
  const WIDE = "@media (min-width: 64rem)";
  const SCRUB =
    "@media screen and (min-width: 64rem) and (prefers-reduced-motion: no-preference) and ( scripting: enabled ) @supports (animation-timeline: view())";

  function at(selector: string, media: string) {
    return Object.assign(
      {},
      ...rulesFor(rules, selector)
        .filter((rule) => rule.media === media)
        .map((rule) => rule.declarations),
    ) as Record<string, string>;
  }

  it("places the panes on a two by two grid and offsets the second row of the zig-zag by 104px from 64rem", () => {
    expect(at(".vk-hl-panes", "")["--hl-offset"]).toBe("6.5rem");
    expect(at(".vk-hl-pane:nth-child(2)", WIDE)["margin-top"]).toBe("var(--hl-offset)");
    expect(at(".vk-hl-pane:nth-child(3)", WIDE)["margin-top"]).toBe("calc(-1 * var(--hl-offset))");
    expect(at(".vk-hl-panes", WIDE)["align-items"]).toBe("start");
    expect(at(".vk-hl-pane:nth-child(1)", WIDE)["grid-area"]).toBe("1 / 1");
    expect(at(".vk-hl-pane:nth-child(4)", WIDE)["grid-area"]).toBe("2 / 2");
  });

  it("draws the spine as two grid items of the panes, so it needs no height guess", () => {
    const spine = at(".vk-hl-panes::after", WIDE);
    expect(spine.position).toBe("static");
    expect(spine["grid-column"]).toBe("1 / -1");
    expect(spine["margin-top"]).toBe("calc(-1 * var(--grid-gap))");
  });

  it("scrubs the fill, stubs and nodes on one view timeline of the panes, behind scripting, no-preference and support", () => {
    expect(at(".vk-hl-panes", SCRUB)["view-timeline"]).toBe("--vk-hl block");
    const fill = at(".vk-hl-panes::after", SCRUB);
    expect(fill["animation-range"]).toBe("cover 8% cover 62%");
    expect(fill["animation-timeline"]).toBe("--vk-hl");
    expect(at(".vk-hl-pane::before", SCRUB).animation).toBe("vk-hl-stub linear both");
    expect(at(".vk-hl-pane::after", SCRUB).animation).toBe("vk-hl-node linear both");
    const timelines = rules.filter((rule) => rule.declarations["animation-timeline"] === "--vk-hl");
    expect(timelines.length).toBe(3);
    for (const rule of timelines) expect(rule.media).toBe(SCRUB);
  });

  it("orders each node after the fill reaches it, stub first", () => {
    const ranges = [1, 2, 3, 4].map((n) => at(`.vk-hl-pane:nth-child(${n})`, SCRUB)["--hl-at"]);
    expect(ranges).toEqual(["9%", "24%", "42%", "57%"]);
    expect(at(".vk-hl-pane::before", SCRUB)["animation-range"]).toBe(
      "cover calc(var(--hl-at) + 5%) cover calc(var(--hl-at) + 8%)",
    );
    expect(at(".vk-hl-pane::after", SCRUB)["animation-range"]).toBe(
      "cover calc(var(--hl-at) + 8%) cover calc(var(--hl-at) + 12%)",
    );
  });

  it("animates only transform and opacity in the three keyframe sets", () => {
    const stub = rules.find(
      (rule) => rule.media === "@keyframes vk-hl-stub" && rule.selector === "from",
    );
    expect(Object.keys(stub?.declarations ?? {})).toEqual(["transform"]);
    const node = rules.find(
      (rule) => rule.media === "@keyframes vk-hl-node" && rule.selector === "from",
    );
    expect(Object.keys(node?.declarations ?? {}).sort()).toEqual(["opacity", "transform"]);
  });

  it("leaves the end state static where nothing scrubs: no animation outside the scrub query", () => {
    for (const rule of rules.filter((r) => /\.vk-hl-pane|\.vk-hl-panes/.test(r.selector))) {
      if (rule.media === SCRUB) continue;
      expect(rule.declarations.animation, rule.selector).toBeUndefined();
      expect(rule.declarations["animation-timeline"], rule.selector).toBeUndefined();
    }
  });

  it("keeps the phone and the 40 to 64rem layouts free of added height", () => {
    const line = at(".vk-hl-panes::before", "");
    expect(line.position).toBe("absolute");
    expect(line.top).toBe("0");
    expect(line.bottom).toBe("0");
    expect(at(".vk-hl-panes::before", "@media (min-width: 40rem)").display).toBe("none");
  });

  it("puts the section's one halo on the rail and the pane tier on --surface-card with a hairline", () => {
    expect(at(".vk-hl-rail", "")["box-shadow"]).toContain("var(--halo-strong)");
    expect(at(".vk-hl", "")["--hl-pane-surface"]).toBe("var(--surface-card)");
    expect(at("html.light .vk-hl", "")["--hl-pane-surface"]).toBe("var(--surface-tile)");
    expect(at(".vk-hl-pane > .vk-lock-card", "")["box-shadow"]).toContain(
      "inset 0 1px 0 var(--hl-edge)",
    );
    expect(rules.filter((r) => r.selector.includes("--halo")).length).toBe(0);
  });

  it("draws the spine and stubs in CanvasText under forced colors", () => {
    const forced = at(".vk-hl-panes::after", "@media (forced-colors: active)");
    expect(forced.background).toBe("CanvasText");
    expect(
      at(".vk-hl-pane::before", "@media (forced-colors: active) @media (min-width: 64rem)")
        .background,
    ).toBe("CanvasText");
  });

  it("holds no variant selector", () => {
    expect(readFileSync(join(process.cwd(), "app/global.css"), "utf8")).not.toContain("data-hl");
  });
});

// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  HERO_CHECK_EXIT_CODE,
  HERO_TERMINAL_CHANGED_KEYS,
  HERO_TERMINAL_LOCALES,
  HERO_TERMINAL_SYNCED_KEYS,
  HERO_TRANSLATE_COMMAND,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";
import { MCP_ADD_COMMAND } from "@/lib/install-commands";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_TRANSLATIONS,
} from "@/lib/landing-playground";
import de from "@/messages/de.json";
import en from "@/messages/en.json";

const rendering = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: en } = await import("@/messages/en.json");
  const { default: de } = await import("@/messages/de.json");
  const catalogs: Record<string, typeof en> = { en, de };
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: rendering.locale,
        messages: catalogs[rendering.locale] ?? en,
        namespace: namespace as never,
      }),
  };
});

const { Highlights } = await import("./highlights");

let root: HTMLElement;

async function renderIn(locale: string): Promise<HTMLElement> {
  rendering.locale = locale;
  const element = document.createElement("div");
  element.innerHTML = renderToStaticMarkup(await Highlights());
  rendering.locale = "en";
  return element;
}

beforeAll(async () => {
  root = await renderIn("en");
});

function tiles(): Element[] {
  return Array.from(root.querySelectorAll(".vk-bento > article.vk-tile"));
}

describe("Highlights", () => {
  it("sets four tiles on the six-column bento, in two rows of six", () => {
    expect(tiles().map((tile) => tile.getAttribute("data-span"))).toEqual(["4", "2", "3", "3"]);
    expect(root.querySelector("section#highlights h2")?.textContent).toBe(
      en.landing.highlights.heading,
    );
  });

  it("derives the sent and total strings from the hero run instead of typing them", () => {
    const locales = HERO_TERMINAL_LOCALES.length;
    const sent = HERO_TERMINAL_CHANGED_KEYS.length * locales;
    const total = (HERO_TERMINAL_CHANGED_KEYS.length + HERO_TERMINAL_SYNCED_KEYS.length) * locales;
    expect(tiles()[0]?.querySelector(".vk-tile-body")?.textContent).toBe(
      `Only ${sent} of ${total} translations are new or changed, so only ${sent} go to your provider.`,
    );
    expect(tiles()[0]?.querySelector("h3")?.textContent).not.toMatch(/\d/);
    const run = tiles()[0]?.querySelector("pre")?.textContent ?? "";
    for (const line of HERO_TRANSLATE_OUTPUT.slice(1)) expect(run).toContain(line);
  });

  it("titles the cost, integrity and check tiles with the pain they remove and keeps the agents title", () => {
    expect(tiles().map((tile) => tile.querySelector("h3")?.textContent)).toEqual([
      "Retranslating everything costs more",
      "Missing keys reach production",
      "One broken placeholder breaks a screen",
      "Your coding agent fixes translations",
    ]);
  });

  it("names the run block by the tile title and wraps it instead of making it a tab stop", () => {
    const block = tiles()[0]?.querySelector("[role='group']");
    expect(block?.getAttribute("aria-labelledby")).toBe("highlights-translate-title");
    expect(block?.classList.contains("vk-tile-code-wrap")).toBe(true);
    expect(tiles()[0]?.querySelector("[tabindex]")).toBeNull();
    expect(root.querySelector("#highlights-translate-title")?.tagName).toBe("H3");
  });

  it.each([
    ["en", "missing or stale keys"],
    ["de", "fehlende oder veraltete Schlüssel"],
    ["es", "claves faltantes u obsoletas"],
    ["fr", "clés manquantes ou obsolètes"],
  ])("says in %s that the check also fails on stale keys", (locale, phrase) => {
    const catalogs = JSON.parse(
      readFileSync(join(process.cwd(), `messages/${locale}.json`), "utf8"),
    ) as typeof en;
    expect(catalogs.landing.highlights.ci.body).toContain(phrase);
  });

  it("titles the check tile and states its real exit code in one translated sentence", () => {
    expect(tiles()[1]?.querySelector("h3")?.textContent).toBe(en.landing.highlights.ci.title);
    expect(tiles()[1]?.querySelector(".vk-tile-exit")?.textContent).toBe(
      `exit ${HERO_CHECK_EXIT_CODE}`,
    );
    expect(tiles()[1]?.querySelector(".vk-tile-body")?.textContent).toContain(
      `exits ${HERO_CHECK_EXIT_CODE} while`,
    );
  });

  it("shows the default playground item in every language, each placeholder marked and the language set", () => {
    const rows = Array.from(tiles()[2]?.querySelectorAll("li") ?? []);
    expect(rows.map((row) => row.getAttribute("lang"))).toEqual([...PLAYGROUND_LANGUAGES]);
    const marks = rows.map((row) =>
      Array.from(row.querySelectorAll("mark.vk-highlight-placeholder")).map(
        (mark) => mark.textContent,
      ),
    );
    expect(marks).toEqual(PLAYGROUND_LANGUAGES.map(() => ["{name}"]));
    rows.forEach((row, index) => {
      const code = PLAYGROUND_LANGUAGES[index] ?? "";
      expect(row.textContent).toBe(
        `${code}: ${PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_DEFAULT_ITEM] ?? ""}`,
      );
    });
  });

  it("styles no line as a token total, because the cli prints none for a run without reported usage", () => {
    expect(tiles()[0]?.querySelector("pre")?.textContent).not.toMatch(/total|token/);
  });

  it("keeps the block's text byte for byte what the CLI prints, one element per line", () => {
    const pre = tiles()[0]?.querySelector("pre");
    expect(pre?.textContent).toBe(
      [`$ ${HERO_TRANSLATE_COMMAND}`, ...HERO_TRANSLATE_OUTPUT.slice(1)].join("\n"),
    );
    const lines = [...(pre?.querySelectorAll(".vk-tile-line") ?? [])];
    expect(lines).toHaveLength(HERO_TRANSLATE_OUTPUT.length);
    for (const line of lines) {
      const text = line.textContent?.replace(/\n$/, "") ?? "";
      const leading = text.length - text.trimStart().length;
      expect(line.getAttribute("style")).toBe(`--vk-hang:${Math.max(2, leading)}ch`);
    }
  });

  it("prints the MCP setup command, wrapped rather than scrolled", () => {
    const code = tiles()[3]?.querySelector(".vk-tile-code-wrap");
    expect(code?.querySelector("pre code")?.textContent).toBe(MCP_ADD_COMMAND);
    expect(code?.querySelector("[tabindex]")).toBeNull();
  });

  it("keeps each flag with its value and the package run whole in the MCP command", () => {
    const units = [
      ...(tiles()[3]?.querySelectorAll(".vk-tile-code-wrap code .whitespace-nowrap") ?? []),
    ].map((unit) => unit.textContent);
    expect(units).toEqual(["--transport stdio", "--scope project", "--", "npx -y @verbatra/mcp"]);
  });

  it("keeps the CLI text English on a German page", async () => {
    const german = await renderIn("de");
    const tile = (index: number) => german.querySelectorAll(".vk-bento > article")[index];
    expect(german.querySelector("section h2")?.textContent).toBe(de.landing.highlights.heading);
    expect(tile(0)?.querySelector("[role='group']")?.getAttribute("lang")).toBe("en");
    expect(tile(1)?.querySelector(".vk-tile-exit")?.getAttribute("lang")).toBe("en");
    expect(tile(3)?.querySelector(".vk-tile-code-wrap")?.getAttribute("lang")).toBe("en");
    expect(tile(1)?.querySelector(".vk-tile-body")?.getAttribute("lang")).toBeNull();
  });
});

describe("Highlights stylesheet", () => {
  const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

  function rule(selector: string): string {
    const start = css.indexOf(`\n${selector} {`);
    return css.slice(start, css.indexOf("\n}", start));
  }

  it("colours the exit code with the danger text token, not a status tint", () => {
    expect(rule(".vk-tile-exit")).toContain("color: var(--text-danger);");
    expect(rule(".vk-tile-exit")).not.toContain("--v-status");
  });

  it("keeps the CI halo in a strip under padding that clears the text", () => {
    const glow = rule(".vk-tile-glow");
    expect(glow).toContain("padding-block-end: calc(1.75rem + var(--tile-halo-height));");
    expect(glow).toMatch(/radial-gradient\(\s*75% var\(--tile-halo-height\) at 50% 100%/);
  });

  it("hangs the continuation rows of each output line under the start of its text", () => {
    const line = rule(".vk-tile-line");
    expect(line).toContain("display: block;");
    expect(line).toContain("padding-inline-start: var(--vk-hang);");
    expect(line).toContain("text-indent: calc(-1 * var(--vk-hang));");
  });

  it("wraps the MCP command instead of scrolling it", () => {
    expect(rule(".vk-tile-code-wrap .vk-tile-pre")).toContain("white-space: pre-wrap;");
    expect(rule(".vk-tile-code-wrap .vk-tile-pre")).toContain("overflow-wrap: break-word;");
  });
});

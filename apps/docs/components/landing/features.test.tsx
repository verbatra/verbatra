// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FEATURE_ARTIFACTS } from "@/lib/feature-artifacts";
import { i18n } from "@/lib/i18n";
import { LANDING_FEATURES } from "@/lib/landing-features";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "de",
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Features } = await import("./features");

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Features());
});

function items(): Element[] {
  return Array.from(root.querySelectorAll("ol.vk-deck > li.vk-deck-item"));
}

describe("Features", () => {
  it("lists the features in workflow order, from the source code to the review", () => {
    expect(LANDING_FEATURES.map(({ id }) => id)).toEqual([
      "extract",
      "types",
      "doctor",
      "watch",
      "handoff",
      "studio",
    ]);
    expect(root.querySelector("p.vk-eyebrow")?.textContent).toBe(en.landing.features.label);
    expect(items().map((item) => item.querySelector("h3")?.textContent)).toEqual(
      LANDING_FEATURES.map(({ id }) => en.landing.features.items[id].title),
    );
  });

  it("shows the command of every feature beside its title", () => {
    expect(items().map((item) => item.querySelector(".vk-deck-command")?.textContent)).toEqual(
      LANDING_FEATURES.map(({ command }) => command),
    );
  });

  it("links every feature to its command page in the reader's locale, outside any label", () => {
    const links = items().map((item) => item.querySelector(".vk-deck-pane a"));
    expect(links.map((link) => link?.getAttribute("href"))).toEqual(
      LANDING_FEATURES.map(({ docsPath }) => `/de${docsPath}`),
    );
    expect(links.map((link) => link?.textContent)).toEqual(
      LANDING_FEATURES.map(({ docsPath }) => docsPath.slice(1)),
    );
    expect(root.querySelectorAll("a")).toHaveLength(LANDING_FEATURES.length);
    expect(root.querySelector("label a, button")).toBeNull();
  });

  it("links only command pages that exist in every locale", () => {
    for (const { docsPath } of LANDING_FEATURES) {
      const page = docsPath.replace(/^\/docs\//, "");
      for (const locale of i18n.languages) {
        const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
        expect(
          existsSync(join(process.cwd(), `content/docs/${page}${suffix}.mdx`)),
          `${page} ${locale}`,
        ).toBe(true);
      }
    }
  });

  it("switches panes through one radio group with the first feature chosen, no script", () => {
    const radios = Array.from(root.querySelectorAll<HTMLInputElement>("input"));
    expect(radios).toHaveLength(LANDING_FEATURES.length);
    expect(new Set(radios.map((radio) => radio.name))).toEqual(new Set(["vk-deck"]));
    expect(radios.map((radio) => radio.type)).toEqual(radios.map(() => "radio"));
    expect(radios.map((radio) => radio.hasAttribute("checked"))).toEqual(
      radios.map((_, index) => index === 0),
    );
    for (const item of items()) {
      const radio = item.querySelector("input");
      expect(item.querySelector("h3 label")?.getAttribute("for")).toBe(radio?.id);
      expect(radio?.closest(".vk-deck-row")).not.toBeNull();
      expect(item.querySelector(".vk-deck-pane")?.id).toBe(radio?.getAttribute("aria-controls"));
    }
    expect(root.querySelector("script, [onclick]")).toBeNull();
  });

  it("puts one artifact card in every pane: a head, a badge and the real output in English", () => {
    expect(items()).toHaveLength(LANDING_FEATURES.length);
    for (const [index, { id }] of LANDING_FEATURES.entries()) {
      const item = items()[index];
      const card = item?.querySelector(".vk-deck-pane .vk-deck-card");
      expect(card?.querySelector(".vk-lock-head span")?.textContent, id).toBe(
        FEATURE_ARTIFACTS[id].head,
      );
      expect(card?.querySelector(".vk-lock-badge")?.textContent?.length, id).toBeGreaterThan(0);
      for (const line of card?.querySelectorAll(".vk-lock-line:not([data-kind='gap'])") ?? []) {
        expect(line.getAttribute("lang"), id).toBe("en");
      }
    }
    expect(root.querySelectorAll(".vk-lock-line[data-kind='command']")).toHaveLength(
      LANDING_FEATURES.length,
    );
    expect(root.querySelectorAll(".vk-lock-line[data-mark]").length).toBeGreaterThanOrEqual(5);
  });

  it("repeats the marked output line as the result of every feature that prints one", () => {
    expect(items().map((item) => item.querySelector(".vk-deck-result")?.textContent)).toEqual(
      LANDING_FEATURES.map(({ id }) => FEATURE_ARTIFACTS[id].result),
    );
    expect(FEATURE_ARTIFACTS.studio.result).toBeUndefined();
  });

  it("shows the handoff file as a table whose empty cells say who fills them", () => {
    const table = root.querySelector("table.vk-deck-sheet");
    expect(Array.from(table?.querySelectorAll("th") ?? [], (cell) => cell.textContent)).toEqual([
      "Key",
      "Source",
      "Status",
      "Translation",
    ]);
    const empty = Array.from(table?.querySelectorAll("td.vk-deck-empty") ?? []);
    expect(empty).toHaveLength(2);
    for (const cell of empty) expect(cell.textContent).toBe(en.landing.features.emptyCell);
  });

  it("shows the real studio overview in both themes, decorative and lazy, in the last pane", () => {
    const images = Array.from(root.querySelectorAll("img"));
    expect(images).toHaveLength(2);
    expect(images[0]?.closest("li")?.querySelector("h3")?.textContent).toBe(
      en.landing.features.items.studio.title,
    );
    for (const image of images) {
      expect(image.getAttribute("alt")).toBe("");
      expect(image.getAttribute("loading")).toBe("lazy");
    }
    expect(root.querySelector("canvas")).toBeNull();
  });

  it("stages the deck only where :has is supported and the viewport is wide", () => {
    const rules = docsStylesheetRules();
    const hidden = rules.find(
      (entry) => entry.selector.includes(".vk-deck-radio") && entry.declarations.display === "none",
    );
    expect(hidden?.media).toBe("");
    const staged = rules.filter(
      (entry) =>
        entry.selector.includes(":has(.vk-deck-radio:checked)") &&
        !entry.media.includes("prefers-reduced-motion"),
    );
    expect(staged.length).toBeGreaterThan(0);
    for (const entry of staged) {
      expect(entry.media).toContain("@supports selector(:has(*))");
      expect(entry.media).toContain("(min-width: 64rem)");
    }
  });

  it("outlines the checked row transparently, which forced colors paint", () => {
    const checked = docsStylesheetRules().find(
      (entry) => entry.selector === ".vk-deck-item:has(.vk-deck-radio:checked) .vk-deck-row",
    );
    expect(checked?.declarations.outline).toBe("2px solid transparent");
  });

  it("carries a title, a body and every badge for every feature in every locale", () => {
    for (const catalog of [en, de, es, fr]) {
      for (const { id } of LANDING_FEATURES) {
        const item = catalog.landing.features.items[id];
        expect(item.title.length, id).toBeGreaterThan(0);
        expect(item.body.length, id).toBeGreaterThan(0);
        expect(catalog.landing.features.badges[id].length, id).toBeGreaterThan(0);
      }
      expect(catalog.landing.features.more).toContain("{count}");
    }
  });
});

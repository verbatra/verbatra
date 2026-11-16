// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "en",
  };
});

const { StatementBand } = await import("./statement-band");

const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

async function band(): Promise<Element> {
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(await StatementBand()),
    "text/html",
  );
  const section = doc.querySelector("section#statement");
  if (section === null) throw new Error("no statement section");
  return section;
}

describe("StatementBand", () => {
  it("is a section named by its own sentence, holding one plain paragraph and no heading", async () => {
    const section = await band();
    const paragraph = section.querySelector("p");
    expect(section.getAttribute("aria-labelledby")).toBe(paragraph?.id);
    expect(paragraph?.textContent).toBe(en.landing.statement.text);
    expect(section.querySelectorAll("p")).toHaveLength(1);
    expect(section.querySelector("h1, h2, h3, .vk-eyebrow, [data-reveal]")).toBeNull();
    expect(paragraph?.className).toBe("vk-statement-text");
  });

  it("sits in the wide column like every other section", async () => {
    const className = (await band()).className;
    expect(className).toContain("vk-w-wide");
    expect(className).toContain("vk-gutter");
    expect(className).toContain("vk-statement");
  });

  it("stays static: no scroll timeline, no pin, no extra height", () => {
    const rules = css.match(/\.vk-statement[^{]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules)
      expect(rule).not.toMatch(/animation|timeline|sticky|min-height|(?:^|\s)height:/m);
  });

  it("sets the sentence at 2.25rem on a phone and 4rem from 48rem, left-aligned at full measure", () => {
    const base = css.match(/\.vk-statement-text \{[^}]*\}/)?.[0] ?? "";
    expect(base).toContain("font-size: 2.25rem;");
    expect(base).toContain("max-width: none;");
    expect(base).not.toContain("text-align");
    expect(css).toMatch(
      /@media \(min-width: 48rem\) \{\s+\.vk-statement-text \{\s+font-size: 4rem;/,
    );
  });
});

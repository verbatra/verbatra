import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

function selectorLists(): string[] {
  return [...CSS.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((match) => (match[2] ?? "").trim());
}

describe("legal page styling", () => {
  it.each([":is(#nd-page, .vk-legal-page) h1", ":is(#nd-page, .vk-legal-page) .vk-page-lead"])(
    "shares the docs page header rule %j",
    (selector) => {
      expect(selectorLists()).toContain(selector);
    },
  );

  it.each(["h2", "h3", "h4"])("gives a legal %s the docs heading rhythm", (tag) => {
    const joined = selectorLists().join("\n");
    expect(joined).toContain(`:is(#nd-page .prose, .vk-legal-page) :where(${tag})`);
  });

  it("caps legal prose at the docs measure but lets the license list run the column", () => {
    const joined = selectorLists().join("\n");
    expect(joined).toMatch(/\.vk-legal-page\s+:where\(p, ul, ol, blockquote, \.vk-callout\)/);
    expect(joined).toContain(".vk-license-list");
  });

  it("keeps the page column at the docs width", () => {
    expect(CSS).toMatch(/\.vk-legal-page \{[^}]*max-width: var\(--width-page\);/);
  });
});

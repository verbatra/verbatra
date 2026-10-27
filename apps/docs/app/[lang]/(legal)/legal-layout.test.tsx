// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalPage, LegalPageHead } from "@/components/legal-page";

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

describe("legal page head", () => {
  const html = renderToStaticMarkup(
    <LegalPage>
      <LegalPageHead eyebrow="Legal" title="Imprint" lead="Lead" />
    </LegalPage>,
  );
  const doc = new DOMParser().parseFromString(html, "text/html");

  it("sits outside the prose typography, so the title, eyebrow and lead keep the docs head spacing", () => {
    const head = doc.querySelector("article.prose > header.vk-page-head");
    expect(head?.classList.contains("not-prose")).toBe(true);
    for (const part of head?.querySelectorAll("h1, .vk-page-eyebrow, .vk-page-lead") ?? []) {
      expect(part.closest(".not-prose"), part.className || part.tagName).toBe(head);
    }
  });

  it("uses the same title, eyebrow and lead classes the docs head does", () => {
    expect(doc.querySelector(".vk-page-head-row > h1")?.textContent).toBe("Imprint");
    expect(doc.querySelector("p.vk-page-eyebrow.vk-label")?.textContent).toBe("Legal");
    expect(CSS).toMatch(/\.vk-page-lead \{[^}]*margin: 1rem 0 0;/);
    expect(CSS).toMatch(/\.vk-page-eyebrow \{[^}]*margin: 0 0 0\.75rem;/);
    expect(CSS).toMatch(/\.vk-page-eyebrow \{[^}]*line-height: 1\.125rem;/);
  });
});

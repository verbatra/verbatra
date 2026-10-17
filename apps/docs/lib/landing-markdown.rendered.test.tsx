// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { catalogTranslator } from "@/test-support/catalog-intl";
import { preloadRegisteredIslands } from "@/test-support/islands";
import { i18n, type Locale } from "./i18n";

const state = vi.hoisted((): { locale: Locale } => ({ locale: "en" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () =>
  (await import("@/test-support/catalog-intl")).catalogIntlServerAt(() => state.locale),
);

vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl")>()),
  useTranslations: (namespace: string) => catalogTranslator(state.locale, namespace),
}));

const { landingMarkdown } = await import("./landing-markdown");
const { Hero } = await import("@/components/landing/hero");
const { Marquee } = await import("@/components/landing/marquee");
const { Playground } = await import("@/components/landing/playground");
const { Compare } = await import("@/components/landing/compare");
const { Faq, faqContent } = await import("@/components/landing/faq");
const { OpenSource } = await import("@/components/landing/open-source");
const { FinalCta } = await import("@/components/landing/final-cta");
const { LANDING_SECTIONS } = await import("./landing-sections");

const SECTIONS = {
  hero: () => Hero(),
  marquee: () => Marquee(),
  playground: () => Playground(),
  compare: () => Compare(),
  faq: async () => Faq({ locale: state.locale, items: await faqContent(state.locale) }),
  openSource: () => OpenSource(),
  finalCta: () => FinalCta(),
} as const;

const TEXT_BLOCKS = "h1, h2, h3, p, li, pre, caption, th, td";

const SKIPPED = [
  "[aria-hidden='true']",
  ".sr-only:not(caption)",
  "script",
  "[data-playground-demo]",
  ".vk-compare-hint",
  "[data-footnotes]",
].join(", ");

function normalized(text: string): string {
  return text
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:])/g, "$1")
    .trim();
}

function markdownText(markdown: string): string {
  return normalized(
    markdown
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/```[^\n]*\n/g, "")
      .replaceAll("`", "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^#+ (\d+\. )?/gm, "")
      .replace(/^- /gm, "")
      .replace(/\s*\|\s*/g, " "),
  );
}

type Block = { readonly tag: string; readonly text: string };

async function renderedBlocks(locale: Locale): Promise<Block[]> {
  state.locale = locale;
  const parts = await Promise.all(LANDING_SECTIONS.map((id) => SECTIONS[id]()));
  const html = parts.map((part) => renderToString(part)).join("");
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const skipped of doc.querySelectorAll(SKIPPED)) skipped.remove();
  for (const br of doc.querySelectorAll("br")) br.replaceWith(" ");
  for (const inline of doc.querySelectorAll("a, .vk-available-from")) {
    inline.before(" ");
    inline.after(" ");
  }
  return Array.from(doc.querySelectorAll(TEXT_BLOCKS))
    .filter((node) => node.querySelector(TEXT_BLOCKS) === null)
    .map((node) => ({ tag: node.localName, text: normalized(node.textContent ?? "") }))
    .filter(({ text }) => text.length > 0);
}

await preloadRegisteredIslands();

describe.each(i18n.languages)("the %s landing markdown against the rendered page", (locale) => {
  it("carries every rendered heading, paragraph, list item, code block and table cell", async () => {
    const markdown = markdownText(await landingMarkdown(locale));
    const blocks = await renderedBlocks(locale);
    expect(blocks.length).toBeGreaterThan(50);
    const tags = new Set(blocks.map(({ tag }) => tag));
    for (const tag of ["caption", "th", "td"]) expect(tags, tag).toContain(tag);
    const missing = blocks.filter(({ text }) => !markdown.includes(text)).map(({ text }) => text);
    expect(missing).toEqual([]);
  });
});

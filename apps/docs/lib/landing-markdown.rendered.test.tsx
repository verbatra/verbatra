// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { preloadRegisteredIslands } from "@/test-support/islands";
import { i18n } from "./i18n";

const MESSAGES_DIR = join(import.meta.dirname, "../messages");

const state = vi.hoisted(() => ({ locale: "en" }));

function messagesOf(locale: string) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    setRequestLocale: () => undefined,
    getLocale: async () => state.locale,
    getTranslations: async (scope?: string | { locale?: string; namespace?: string }) => {
      const locale = typeof scope === "object" && scope.locale ? scope.locale : state.locale;
      const namespace = typeof scope === "string" ? scope : scope?.namespace;
      return createTranslator({
        locale,
        messages: messagesOf(locale),
        namespace: namespace as never,
      });
    },
  };
});

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: messagesOf(state.locale),
        namespace: namespace as never,
      }),
  };
});

const { landingMarkdown } = await import("./landing-markdown");
const { Hero } = await import("@/components/landing/hero");
const { Marquee } = await import("@/components/landing/marquee");
const { Playground } = await import("@/components/landing/playground");
const { Flow } = await import("@/components/landing/flow");
const { Bento } = await import("@/components/landing/bento");
const { Compare } = await import("@/components/landing/compare");
const { Faq, faqContent } = await import("@/components/landing/faq");
const { OpenSource } = await import("@/components/landing/open-source");
const { FinalCta } = await import("@/components/landing/final-cta");
const { LANDING_SECTIONS } = await import("./landing-sections");

type Locale = (typeof i18n.languages)[number];

const SECTIONS = {
  hero: () => Hero(),
  marquee: () => Marquee(),
  playground: () => Playground(),
  flow: () => Flow(),
  features: () => Bento(),
  compare: () => Compare(),
  faq: async () =>
    Faq({ locale: state.locale as Locale, items: await faqContent(state.locale as Locale) }),
  openSource: () => OpenSource(),
  finalCta: () => FinalCta(),
} as const;

const TEXT_BLOCKS = "h1, h2, h3, p, li, pre";

const SKIPPED = [
  "[aria-hidden='true']",
  ".sr-only",
  "script",
  "[data-playground-demo]",
  ".vk-showcase",
  ".vk-marquee-viewport li",
  ".vk-compare-hint",
  ".vk-hero-diff-mark",
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

async function renderedBlocks(locale: string): Promise<string[]> {
  state.locale = locale;
  const parts = await Promise.all(LANDING_SECTIONS.map((id) => SECTIONS[id]()));
  const html = parts.map((part) => renderToString(part)).join("");
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const skipped of doc.querySelectorAll(SKIPPED)) skipped.remove();
  for (const br of doc.querySelectorAll("br")) br.replaceWith(" ");
  for (const line of doc.querySelectorAll(".vk-showcase-line")) line.after("\n");
  for (const inline of doc.querySelectorAll("a, .vk-available-from")) {
    inline.before(" ");
    inline.after(" ");
  }
  return Array.from(doc.querySelectorAll(TEXT_BLOCKS))
    .filter((node) => node.querySelector(TEXT_BLOCKS) === null)
    .map((node) => normalized(node.textContent ?? ""))
    .filter((text) => text.length > 0);
}

await preloadRegisteredIslands();

describe.each(i18n.languages)("the %s landing markdown against the rendered page", (locale) => {
  it("carries every rendered heading, paragraph, list item and code block", async () => {
    const markdown = markdownText(await landingMarkdown(locale));
    const blocks = await renderedBlocks(locale);
    expect(blocks.length).toBeGreaterThan(50);
    const missing = blocks.filter((text) => !markdown.includes(text));
    expect(missing).toEqual([]);
  });
});

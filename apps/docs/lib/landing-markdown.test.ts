import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { stripAccentTags } from "@/test-support/accent-tags";
import { i18n } from "./i18n";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "./landing-facts";
import { FAQ_ITEM_IDS } from "./landing-faq";
import { landingProviders } from "./landing-providers";

const MESSAGES_DIR = join(import.meta.dirname, "../messages");

function messagesOf(locale: string) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

vi.mock(
  "next-intl/server",
  async () => (await import("@/test-support/catalog-intl")).catalogIntlServer,
);

const { landingMarkdown } = await import("./landing-markdown");
const { faqContent } = await import("@/components/landing/faq");

const SECTION_HEADINGS = [
  "banner.headline",
  "marquee.heading",
  "statement.label",
  "highlights.heading",
  "playground.heading",
  "features.heading",
  "faq.heading",
  "closing.heading",
] as const;

function message(messages: Record<string, unknown>, path: string): string {
  const text = path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages) as string;
  return stripAccentTags(text);
}

function plain(markdown: string): string {
  return markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replaceAll("`", "");
}

describe.each(i18n.languages)("the %s landing markdown", (locale) => {
  const messages = messagesOf(locale).landing;

  it("opens with the landing title and description as frontmatter and one h1", async () => {
    const body = await landingMarkdown(locale);
    expect(body.startsWith(`---\ntitle: ${JSON.stringify(messages.meta.title)}\n`)).toBe(true);
    expect(body).toContain(`description: ${JSON.stringify(messages.meta.description)}`);
    expect(body.match(/^# /gm)).toHaveLength(1);
  });

  it("follows the section order of the page", async () => {
    const body = await landingMarkdown(locale);
    const positions = SECTION_HEADINGS.map((path) => body.indexOf(message(messages, path)));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("states every provider and format by name and gives no raw message keys", async () => {
    const body = await landingMarkdown(locale);
    for (const provider of landingProviders()) expect(body).toContain(provider.label);
    for (const id of SUPPORTED_FORMAT_IDS) expect(body).toContain(FORMAT_DISPLAY[id].label);
    expect(body).not.toMatch(/landing\.[a-zA-Z]+\./);
  });

  it("answers every faq question with the text the structured data carries", async () => {
    const body = plain(await landingMarkdown(locale));
    const items = await faqContent(locale);
    expect(items).toHaveLength(FAQ_ITEM_IDS.length);
    for (const item of items) {
      expect(body).toContain(`### ${item.question}\n\n${item.answer}\n`);
    }
  });

  it("links only absolute urls, docs pages by their markdown form", async () => {
    const body = await landingMarkdown(locale);
    const targets = Array.from(body.matchAll(/\]\(([^)]+)\)/g), (match) => match[1] ?? "");
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target).toMatch(/^https:\/\//);
    for (const target of targets.filter((url) => url.includes("/docs"))) {
      expect(target).toMatch(/\.md(#.*)?$/);
    }
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { stripAccentTags } from "@/test-support/accent-tags";
import { HERO_TERMINAL_CHANGED_KEYS, HERO_TERMINAL_SYNCED_KEYS } from "./hero-terminal";
import { i18n } from "./i18n";
import { SDK_INSTALL_COMMAND } from "./install-commands";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "./landing-facts";
import { FAQ_ITEM_IDS } from "./landing-faq";
import { landingProviders } from "./landing-providers";
import { SITE_URL } from "./site";

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
  "lockDemo.label",
  "gate.heading",
  "highlights.heading",
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

describe("the English landing markdown after the surfaces and the comparison link", () => {
  it("lists the comparison link beside Get started in the hero", async () => {
    const body = await landingMarkdown("en");
    expect(body).toContain(
      `- [Get started](${SITE_URL}/docs/quickstart.md)\n- [Compare with other tools](${SITE_URL}/compare)`,
    );
  });

  it("opens the highlights on the four surfaces and the one lock file, in the order of the panes", async () => {
    const body = await landingMarkdown("en");
    const at = body.indexOf("## Ask any surface, get the same answer");
    expect(at).toBeGreaterThan(0);
    const section = body.slice(at, body.indexOf("\n## ", at + 3));
    expect(section).toContain(
      `Every surface reads one lock file, so German reads ${HERO_TERMINAL_CHANGED_KEYS.length} stale and ${HERO_TERMINAL_SYNCED_KEYS.length} up-to-date wherever you ask.`,
    );
    const names = ["### CLI", "### Studio", "### SDK", "### MCP server"].map((heading) =>
      section.indexOf(heading),
    );
    expect(names.every((position) => position > 0)).toBe(true);
    expect([...names].sort((a, b) => a - b)).toEqual(names);
    expect(section).toContain(`[docs/sdk/inspect](${SITE_URL}/docs/sdk/inspect.md)`);
    expect(section).toContain("| de | 86% 12 / 14 keys | 0 | 2 | 12 |");
    expect(section).toContain("claude mcp add");
    expect(section).toContain(SDK_INSTALL_COMMAND);
  });

  it("prints the not-written stamp of the gate outside every fenced block, so no CLI line is altered", async () => {
    const body = await landingMarkdown("en");
    const at = body.indexOf("## When the provider gets it wrong, nothing is written");
    const section = body.slice(at, body.indexOf("\n## ", at + 3));
    expect(section).toContain("**verbatra translate** not written 1 integrity-withheld");
    const fenced = [...section.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(
      (match) => match[1] ?? "",
    );
    expect(fenced.length).toBeGreaterThan(4);
    for (const block of fenced) expect(block).not.toMatch(/not written/i);
    expect(fenced.some((block) => block.includes("profile.greeting: placeholder (-{name})"))).toBe(
      true,
    );
  });

  it("ends the faq with the comparison answer linked to the comparison page", async () => {
    const body = await landingMarkdown("en");
    expect(body).toContain("### How is Verbatra different from other i18n tools?");
    expect(body).toContain(
      `The [comparison page](${SITE_URL}/compare) checks it against other tools`,
    );
    expect(body).not.toContain("re-translate strings that did not change");
  });
});

describe("the English landing markdown closing panel", () => {
  it("lists the five proof links after the two commands, the docs page by its markdown form", async () => {
    const body = await landingMarkdown("en");
    expect(body).toContain(
      [
        "- [npm provenance](https://www.npmjs.com/package/@verbatra/cli)",
        "- [MIT license](https://github.com/verbatra/verbatra/blob/main/LICENSE)",
        `- [The CLI sends no telemetry](${SITE_URL}/docs/data-handling.md)`,
        "- [90% coverage gate](https://codecov.io/gh/verbatra/verbatra)",
        "- [CI workflow](https://github.com/verbatra/verbatra/actions/workflows/ci.yml)",
      ].join("\n"),
    );
    expect(body.indexOf("npx @verbatra/cli translate --dry-run")).toBeLessThan(
      body.indexOf("- [npm provenance]"),
    );
  });
});

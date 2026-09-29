import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const TRANSLATIONS = i18n.languages.filter((locale) => locale !== i18n.defaultLanguage);
const LOCALE_SUFFIX = new RegExp(`\\.(${TRANSLATIONS.join("|")})\\.(mdx|json)$`);
const FENCE = /^\s*(`{3,}|~{3,})/;
const AVAILABLE_FROM = /<AvailableFrom\b([^>]*)\/>/g;
const META_LINK = /^(external:)?\[[^\]]+\]\(([^)]+)\)$/;
const LOCALE_PREFIX = new RegExp(`^/(${TRANSLATIONS.join("|")})(?=/)`);

type PageShape = {
  h2: number;
  h3: number;
  codeBlocks: number;
  availableFrom: string[];
};

function contentFiles(): string[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).filter(
    (file) => file.endsWith(".mdx") || file.endsWith(".json"),
  );
}

function sourceFiles(extension: ".mdx" | ".json"): string[] {
  return contentFiles()
    .filter((file) => file.endsWith(extension) && !LOCALE_SUFFIX.test(file))
    .sort();
}

function localized(file: string, locale: string): string {
  return file.replace(/\.(mdx|json)$/, `.${locale}.$1`);
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
}

function availableFromLabels(line: string): string[] {
  return [...line.matchAll(AVAILABLE_FROM)].map(([, attributes = ""]) => {
    const pkg = attribute(attributes, "pkg");
    const version = attribute(attributes, "version") ?? "";
    return pkg === undefined ? version : `${pkg}@${version}`;
  });
}

function closesFence(line: string, fence: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith(fence) && /^[`~]+$/.test(trimmed);
}

function pageShape(source: string): PageShape {
  const shape: PageShape = { h2: 0, h3: 0, codeBlocks: 0, availableFrom: [] };
  let fence: string | undefined;
  for (const line of source.split("\n")) {
    if (fence !== undefined) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const opening = FENCE.exec(line)?.[1];
    if (opening !== undefined) {
      fence = opening;
      shape.codeBlocks += 1;
      continue;
    }
    if (line.startsWith("## ")) shape.h2 += 1;
    if (line.startsWith("### ")) shape.h3 += 1;
    shape.availableFrom.push(...availableFromLabels(line));
  }
  return shape;
}

function readContent(file: string): string {
  return readFileSync(join(CONTENT_DIR, file), "utf8");
}

function metaPages(file: string): string[] {
  const meta = JSON.parse(readContent(file)) as { pages?: string[] };
  return (meta.pages ?? []).map(comparableMetaItem);
}

function comparableMetaItem(item: string): string {
  if (item.startsWith("---")) return "---";
  const link = META_LINK.exec(item);
  if (!link) return item;
  return `${link[1] ?? ""}link:${link[2]?.replace(LOCALE_PREFIX, "")}`;
}

const PAGES = sourceFiles(".mdx");
const METAS = sourceFiles(".json");

describe("docs locale parity", () => {
  it("finds the English pages and their meta files", () => {
    expect(PAGES.length).toBeGreaterThan(40);
    expect(PAGES).toContain("index.mdx");
    expect(METAS).toContain("cli/meta.json");
    expect(TRANSLATIONS.length).toBeGreaterThanOrEqual(3);
  });

  it("has a translation for every English file and no translation without one", () => {
    const expected = [...PAGES, ...METAS]
      .flatMap((file) => [file, ...TRANSLATIONS.map((locale) => localized(file, locale))])
      .sort();

    expect(contentFiles().sort()).toEqual(expected);
  });

  describe.each(TRANSLATIONS)("%s", (locale) => {
    it.each(PAGES)("%s keeps the English page's headings, code blocks and versions", (page) => {
      expect(pageShape(readContent(localized(page, locale)))).toEqual(pageShape(readContent(page)));
    });

    it.each(METAS)("%s lists the same pages as the English meta file", (meta) => {
      expect(metaPages(localized(meta, locale))).toEqual(metaPages(meta));
    });
  });
});

describe("pageShape", () => {
  const page = [
    "## Setup",
    '<AvailableFrom version="0.12.0" />',
    "```bash",
    "## not a heading inside a fence",
    "```",
    "### Flags",
    '<AvailableFrom version="0.3.0" pkg="@verbatra/mcp" />',
    "````md",
    "```ts",
    "```",
    "````",
  ].join("\n");

  it("counts headings and code blocks outside fences and reads every version callout", () => {
    expect(pageShape(page)).toEqual({
      h2: 1,
      h3: 1,
      codeBlocks: 2,
      availableFrom: ["0.12.0", "@verbatra/mcp@0.3.0"],
    });
  });

  it("sees a translation that dropped a section, a code block or a version callout", () => {
    const shape = pageShape(page);

    expect(pageShape(page.replace("### Flags", "Flags"))).not.toEqual(shape);
    expect(pageShape(page.replace("```bash", "bash").replace("\n```\n", "\n"))).not.toEqual(shape);
    expect(pageShape(page.replace('version="0.12.0"', 'version="0.11.0"'))).not.toEqual(shape);
  });
});

describe("comparableMetaItem", () => {
  it("lets a translation rename a sidebar link and prefix its locale, but not retarget it", () => {
    const english = comparableMetaItem("[MCP server tools](/docs/cli/mcp#tools)");
    expect(comparableMetaItem("[MCP-Server-Tools](/de/docs/cli/mcp#tools)")).toBe(english);
    expect(comparableMetaItem("[MCP-Server-Tools](/de/docs/cli/mcp)")).not.toBe(english);
    expect(comparableMetaItem("external:[Notes](https://example.com)")).toBe(
      "external:link:https://example.com",
    );
    expect(comparableMetaItem("---Alltag---")).toBe("---");
  });
});

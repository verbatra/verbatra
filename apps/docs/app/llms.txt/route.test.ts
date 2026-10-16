import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/lib/i18n";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { landingProviders } from "@/lib/landing-providers";
import { SITE_MARKDOWN_PAGES, siteMarkdownUrl } from "@/lib/markdown-route";
import en from "@/messages/en.json";

const PAGES = [
  { url: "/docs", data: { title: "Introduction", description: "What verbatra is." } },
  { url: "/docs/formats", data: { title: "Formats", description: "The supported formats." } },
  { url: "/docs/cli", data: { title: "Overview", description: "Every command." } },
  { url: "/docs/cli/translate", data: { title: "verbatra translate", description: "Translate." } },
];

vi.mock("@/lib/source", () => ({
  source: {
    getPages: () => PAGES,
    getPageTree: () => ({
      children: [
        {
          type: "folder",
          name: "Docs",
          root: true,
          children: [{ type: "page", url: "/docs" }],
        },
        {
          type: "folder",
          name: "Reference",
          root: true,
          children: [
            {
              type: "folder",
              name: "CLI",
              index: { type: "page", url: "/docs/cli" },
              children: [
                { type: "separator", name: "Translate" },
                { type: "page", url: "/docs/cli/translate" },
              ],
            },
            {
              type: "folder",
              name: "Configuration",
              children: [{ type: "page", url: "/docs/formats" }],
            },
            { type: "page", url: "/docs/cli/mcp#tools" },
          ],
        },
      ],
    }),
  },
}));

const CONTENT_ROOT = join(import.meta.dirname, "../../content/docs");

function contentPagesFor(slug: string): string[] {
  return readdirSync(CONTENT_ROOT, { recursive: true, encoding: "utf8" }).filter(
    (file) =>
      file
        .replace(/\.mdx$/, "")
        .split(/[\\/]/)
        .filter((segment) => !/^\(.+\)$/.test(segment))
        .join("/") === slug,
  );
}

vi.mock("next-intl/server", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
      createTranslator({
        locale,
        messages: JSON.parse(
          readFileSync(join(import.meta.dirname, `../../messages/${locale}.json`), "utf8"),
        ),
        namespace: namespace as never,
      }),
  };
});

const RETIRED_LANDING_SECTIONS = [
  "Verbatra in numbers",
  "Locale files drift every time you ship.",
  "Use it from the terminal or from your own code.",
  "Review every locale in Verbatra Studio.",
  "See it work.",
  "Fits the project you already have.",
  "Open source under the MIT license.",
] as const;

const { GET } = await import("./route");
const body = await (await GET()).text();

describe("llms.txt", () => {
  it("links every page to its markdown source", () => {
    expect(body).toContain(
      "- [Formats](https://verbatra.kreitz-webdev.de/docs/formats.md): The supported formats.",
    );
    expect(body).toContain("(https://verbatra.kreitz-webdev.de/docs.md)");
    expect(body).not.toMatch(/\]\(https:\/\/verbatra\.kreitz-webdev\.de\/docs\/formats\)/);
  });

  it("lists the groups inside both tabs as sections, in sidebar order", () => {
    const headings = Array.from(body.matchAll(/^## .+$/gm), ([heading]) => heading);
    expect(headings.slice(headings.indexOf("## Introduction"))).toEqual([
      "## Introduction",
      "## CLI",
      "## Configuration",
      "## JSON Schemas",
      "## Translations",
      "## Optional",
    ]);
    expect(body).toContain(
      "## CLI\n\n- [Overview](https://verbatra.kreitz-webdev.de/docs/cli.md): Every command.\n- [verbatra translate]",
    );
    expect(body).not.toContain("#tools");
  });

  it("orients an agent before the page index", () => {
    const agents = body.indexOf("## For AI agents");
    expect(agents).toBeGreaterThan(-1);
    expect(agents).toBeLessThan(body.indexOf("## Introduction"));
    expect(body).toContain("npx -y @verbatra/mcp");
    expect(body).toContain("Accept: text/markdown");
  });

  it("states the Node.js range the published packages declare", async () => {
    const { NODE_RANGE } = await import("@/lib/site");
    expect(body).toContain(`- Requires Node.js ${NODE_RANGE}\n`);
  });

  it("points an agent at the MCP client setup page from the agent section", () => {
    const agents = body.slice(body.indexOf("## For AI agents"), body.indexOf("## Introduction"));
    expect(agents).toContain(
      "Client setup: https://verbatra.kreitz-webdev.de/docs/connect-an-mcp-client.md",
    );
    expect(contentPagesFor("connect-an-mcp-client")).toHaveLength(1);
  });

  it("tells an agent every page type a Markdown response can declare", () => {
    expect(body).toContain("page type (one of overview, tutorial, how-to, concept, reference)");
  });

  it("lists every published JSON Schema by its stable URL after the page index", () => {
    const schemas = body.slice(body.indexOf("## JSON Schemas"));
    expect(schemas).toContain(
      "- [verbatra config](https://verbatra.kreitz-webdev.de/schema/v1/config.json)",
    );
    expect(schemas).toContain(
      "- [verbatra --json envelope](https://verbatra.kreitz-webdev.de/schema/v1/envelope.json)",
    );
    expect(body).toContain(
      "JSON Schemas for every envelope and stderr record: https://verbatra.kreitz-webdev.de/schema/v1",
    );
  });

  it("ends on an Optional section with the release notes and the README", () => {
    const optional = body.slice(body.indexOf("## Optional"));
    expect(optional).toContain("- [Release notes](https://github.com/verbatra/verbatra/releases)");
    expect(optional).toContain("- [README](https://github.com/verbatra/verbatra#readme)");
  });

  it("opens with the landing definition as its summary", () => {
    expect(body.startsWith(`# Verbatra\n\n> ${en.landing.meta.definition}\n`)).toBe(true);
  });

  it("lists the markdown url of every site page in every locale", () => {
    for (const locale of i18n.languages) {
      for (const page of SITE_MARKDOWN_PAGES) {
        expect(body).toContain(
          `(https://verbatra.kreitz-webdev.de${siteMarkdownUrl(locale, page)})`,
        );
      }
    }
    const site = body.slice(body.indexOf("## Site"), body.indexOf("## Introduction"));
    expect(site).toContain(
      `- [${en.landing.meta.title}](https://verbatra.kreitz-webdev.de/index.md): ${en.landing.meta.description}`,
    );
    expect(site).toContain(
      `- [${en.compare.meta.title}](https://verbatra.kreitz-webdev.de/compare.md): ${en.compare.meta.description}`,
    );
  });

  it("names the providers and formats from the registries the site renders", () => {
    for (const provider of landingProviders()) expect(body).toContain(provider.label);
    for (const id of SUPPORTED_FORMAT_IDS) expect(body).toContain(FORMAT_DISPLAY[id].label);
  });

  it("points a coding agent at the repository's AGENTS.md", () => {
    expect(body).toContain("https://github.com/verbatra/verbatra/blob/main/AGENTS.md");
  });

  it("names no retired landing section", () => {
    for (const heading of RETIRED_LANDING_SECTIONS) expect(body).not.toContain(heading);
  });
});

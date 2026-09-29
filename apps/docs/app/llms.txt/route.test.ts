import { describe, expect, it, vi } from "vitest";

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

const { GET } = await import("./route");
const body = await GET().text();

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
});

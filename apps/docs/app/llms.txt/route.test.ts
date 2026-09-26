import { describe, expect, it, vi } from "vitest";

const PAGES = [
  { url: "/docs", data: { title: "Introduction", description: "What verbatra is." } },
  { url: "/docs/formats", data: { title: "Formats", description: "The supported formats." } },
];

vi.mock("@/lib/source", () => ({
  source: {
    getPages: () => PAGES,
    getPageTree: () => ({
      children: [
        { type: "page", url: "/docs" },
        {
          type: "folder",
          name: "Configuration",
          children: [{ type: "page", url: "/docs/formats" }],
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

  it("orients an agent before the page index", () => {
    const agents = body.indexOf("## For AI agents");
    expect(agents).toBeGreaterThan(-1);
    expect(agents).toBeLessThan(body.indexOf("## Introduction"));
    expect(body).toContain("npx -y @verbatra/mcp");
    expect(body).toContain("Accept: text/markdown");
  });
});

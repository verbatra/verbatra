import type { Root } from "fumadocs-core/page-tree";
import { describe, expect, it } from "vitest";
import { duplicatesFooter, footerNeighbourUrls } from "@/lib/docs-neighbours";

const TREE: Root = {
  name: "docs",
  children: [
    { type: "page", name: "Start", url: "/fr/docs/start-with-ai" },
    { type: "page", name: "MCP", url: "/fr/docs/connect-an-mcp-client" },
    { type: "page", name: "Recipes", url: "/fr/docs/agent-recipes" },
  ],
};

describe("footer neighbours", () => {
  it("lists the previous and next page the footer links to", () => {
    expect([...footerNeighbourUrls(TREE, "/fr/docs/connect-an-mcp-client")].sort()).toEqual([
      "/fr/docs/agent-recipes",
      "/fr/docs/start-with-ai",
    ]);
  });

  it("drops a card that repeats a footer link and keeps a deep link into the same page", () => {
    const neighbours = footerNeighbourUrls(TREE, "/fr/docs/connect-an-mcp-client");
    expect(duplicatesFooter("/fr/docs/agent-recipes", neighbours)).toBe(true);
    expect(duplicatesFooter("/fr/docs/agent-recipes#the-skills-pack", neighbours)).toBe(false);
    expect(duplicatesFooter("/fr/docs/providers", neighbours)).toBe(false);
    expect(duplicatesFooter(undefined, neighbours)).toBe(false);
  });
});

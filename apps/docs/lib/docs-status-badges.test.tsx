// @vitest-environment jsdom

import type * as PageTree from "fumadocs-core/page-tree";
import type { Node as StatusNode } from "fumadocs-core/source/plugins/status-badges";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const BADGE_LABELS: Record<string, Record<string, string>> = {
  en: { new: "new" },
  de: { new: "neu" },
};

vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ locale }: { locale: string }) =>
    (key: string) =>
      BADGE_LABELS[locale]?.[key] ?? key,
}));

const { withStatusBadges } = await import("./docs-status-badges");

const fresh: StatusNode = { type: "page", name: "TMX", url: "/docs/cli/tmx", status: "new" };
const plain: StatusNode = { type: "page", name: "Diff", url: "/docs/cli/diff" };
const beta: StatusNode = { type: "page", name: "Watch", url: "/docs/cli/watch", status: "beta" };

const tree = {
  name: "Documentation",
  children: [
    fresh,
    { type: "separator", name: "Reference" },
    {
      type: "folder",
      name: "CLI",
      index: { type: "page", name: "Overview", url: "/docs/cli", status: "new" },
      children: [plain, beta, { type: "folder", name: "Nested", children: [fresh] }],
    },
  ],
} as PageTree.Root;

function markup(node: PageTree.Node | undefined): string {
  return renderToStaticMarkup(node?.name ?? null);
}

describe("withStatusBadges", () => {
  it("renders the badge in the reader's language", async () => {
    const german = await withStatusBadges(tree, "de");
    expect(markup(german.children[0])).toMatch(/^TMX<span [^>]*>neu<\/span>$/);
    const english = await withStatusBadges(tree, "en");
    expect(markup(english.children[0])).toMatch(/^TMX<span [^>]*>new<\/span>$/);
  });

  it("badges nested pages and folder index pages", async () => {
    const folder = (await withStatusBadges(tree, "de")).children[2] as StatusNode;
    if (folder.type !== "folder") throw new Error("expected a folder");
    expect(renderToStaticMarkup(folder.index?.name)).toContain(">neu</span>");
    const nested = folder.children[2];
    if (nested?.type !== "folder") throw new Error("expected a nested folder");
    expect(markup(nested.children[0])).toContain(">neu</span>");
  });

  it("leaves pages without a known status and separators untouched", async () => {
    const result = await withStatusBadges(tree, "de");
    const folder = result.children[2] as StatusNode;
    if (folder.type !== "folder") throw new Error("expected a folder");
    expect(folder.children[0]).toBe(plain);
    expect(folder.children[1]).toBe(beta);
    expect(result.children[1]).toBe(tree.children[1]);
  });
});

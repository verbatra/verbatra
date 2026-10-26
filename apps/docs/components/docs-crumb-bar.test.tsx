// @vitest-environment jsdom

import type * as PageTree from "fumadocs-core/page-tree";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const translate: PageTree.Item = { type: "page", name: "translate", url: "/docs/cli/translate" };
const cli: PageTree.Folder = { type: "folder", name: "CLI", children: [translate] };
const reference: PageTree.Folder = {
  type: "folder",
  name: "Reference",
  root: true,
  children: [cli],
};
const full: PageTree.Root = { name: "Docs", children: [reference] };
const state = vi.hoisted(() => ({ path: [] as ReadonlyArray<unknown> }));

vi.mock("fumadocs-ui/contexts/tree", () => ({
  useTreeContext: () => ({ full }),
  useTreePath: () => state.path,
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const { DocsCrumbBar } = await import("./docs-crumb-bar");

function render(): Document {
  const markup = renderToStaticMarkup(
    <DocsCrumbBar>
      <button type="button">menu</button>
    </DocsCrumbBar>,
  );
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("DocsCrumbBar", () => {
  it("lists the tab, the group and the page in that order inside a labelled nav", () => {
    state.path = [reference, cli, translate];
    const doc = render();
    const nav = doc.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("docs.breadcrumb.label");
    const items = [...doc.querySelectorAll("li.vk-crumbs-item")].map((li) => li.textContent);
    expect(items).toEqual(["Reference", "CLI", "translate"]);
  });

  it("marks only the page as current and hides the separators from assistive technology", () => {
    state.path = [reference, cli, translate];
    const doc = render();
    const current = doc.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("translate");
    const separators = [...doc.querySelectorAll("li.vk-crumbs-separator")];
    expect(separators).toHaveLength(2);
    for (const separator of separators) expect(separator.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the trigger before the trail", () => {
    state.path = [reference, cli, translate];
    const markup = renderToStaticMarkup(
      <DocsCrumbBar>
        <button type="button">menu</button>
      </DocsCrumbBar>,
    );
    expect(markup.indexOf("<button")).toBeLessThan(markup.indexOf("<nav"));
  });
});

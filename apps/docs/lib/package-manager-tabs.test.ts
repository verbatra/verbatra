import { describe, expect, it } from "vitest";
import { NPM_INSTALL_COMMAND } from "./install-commands";
import {
  npmFenceMarkdown,
  PACKAGE_MANAGER_GROUP,
  remarkPackageManagerTabs,
  TABS_COMPONENT,
} from "./package-manager-tabs";

type Node = {
  type: string;
  name?: string;
  lang?: string | null;
  value?: string;
  attributes?: { name?: string; value?: unknown }[];
  children?: Node[];
  data?: Record<string, unknown>;
};

function run(root: Node): Node {
  const transform = remarkPackageManagerTabs() as (tree: Node) => void;
  transform(root);
  return root;
}

function codes(node: Node): string[] {
  if (node.type === "code") return [node.value ?? ""];
  return (node.children ?? []).flatMap(codes);
}

describe("remarkPackageManagerTabs", () => {
  it("turns an npm fence into npm, pnpm, yarn and bun tabs that share one remembered choice", () => {
    const root = run({
      type: "root",
      children: [{ type: "code", lang: "npm", value: NPM_INSTALL_COMMAND }],
    });
    const [tabs] = root.children ?? [];
    expect(tabs?.name).toBe(TABS_COMPONENT);
    expect(tabs?.attributes).toContainEqual(
      expect.objectContaining({ name: "groupId", value: PACKAGE_MANAGER_GROUP }),
    );
    expect(codes(root)).toEqual([
      NPM_INSTALL_COMMAND,
      "pnpm add --save-dev @verbatra/cli",
      "yarn add --dev @verbatra/cli",
      "bun add --dev @verbatra/cli",
    ]);
  });

  it("prints the npm command alone in the page's Markdown", () => {
    const root = run({
      type: "root",
      children: [
        { type: "code", lang: "npm", value: NPM_INSTALL_COMMAND },
        { type: "code", lang: "npm", value: "npm install next-intl" },
      ],
    });
    expect(root.children?.map((tabs) => tabs.data?._stringify)).toEqual([
      { text: npmFenceMarkdown(NPM_INSTALL_COMMAND) },
      { text: npmFenceMarkdown("npm install next-intl") },
    ]);
  });

  it("leaves a bash fence alone", () => {
    const root = run({
      type: "root",
      children: [{ type: "code", lang: "bash", value: "npx @verbatra/cli check" }],
    });
    expect(root.children).toEqual([
      { type: "code", lang: "bash", value: "npx @verbatra/cli check" },
    ]);
  });
});

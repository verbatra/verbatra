import { describe, expect, it } from "vitest";
import { NPM_INSTALL_COMMAND, RUN_FENCE_LANG } from "./install-commands";
import { llmMarkdown } from "./llm-markdown-test-support";
import {
  commandMarkdown,
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
};

function run(root: Node): Node {
  const transform = remarkPackageManagerTabs() as (tree: Node, file: object) => void;
  transform(root, {});
  return root;
}

function markdownOf(value: string): Promise<string> {
  return llmMarkdown({ value }, [remarkPackageManagerTabs]);
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

  it("prints the npm command alone in the page's Markdown", async () => {
    const markdown = await markdownOf(
      `Install:\n\n\`\`\`npm\n${NPM_INSTALL_COMMAND}\n\`\`\`\n\n\`\`\`npm\nnpm install next-intl\n\`\`\`\n`,
    );
    expect(markdown).toBe(
      `${[
        "Install:",
        commandMarkdown(NPM_INSTALL_COMMAND),
        commandMarkdown("npm install next-intl"),
      ].join("\n\n")}\n`,
    );
  });

  it("keeps a fence nested in a list as a command in the page's Markdown", async () => {
    const markdown = await markdownOf(
      `- Run:\n\n  \`\`\`npm\n  ${NPM_INSTALL_COMMAND}\n  \`\`\`\n`,
    );
    expect(markdown).toBe(`- Run:\n\n  \`\`\`bash\n  ${NPM_INSTALL_COMMAND}\n  \`\`\`\n`);
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

  it("marks each fence's own tabs, whatever tabs the page already holds", () => {
    const handWritten: Node = { type: "mdxJsxFlowElement", name: TABS_COMPONENT, children: [] };
    const root = run({
      type: "root",
      children: [handWritten, { type: "code", lang: "npm", value: NPM_INSTALL_COMMAND }],
    });
    expect(root.children?.[0]).toEqual({
      type: "mdxJsxFlowElement",
      name: TABS_COMPONENT,
      children: [],
    });
    expect(root.children?.[1]?.name).toBe(TABS_COMPONENT);
  });

  it("tabs a verbatra run fence by the binary each package manager runs", async () => {
    const root = run({
      type: "root",
      children: [{ type: "code", lang: RUN_FENCE_LANG, value: "<command>" }],
    });
    const [tabs] = root.children ?? [];
    expect(tabs?.name).toBe(TABS_COMPONENT);
    expect(codes(root)).toEqual([
      "npx @verbatra/cli <command>",
      "pnpm verbatra <command>",
      "yarn verbatra <command>",
      "bun run verbatra <command>",
    ]);
    expect(await markdownOf(`\`\`\`${RUN_FENCE_LANG}\n<command>\n\`\`\`\n`)).toBe(
      `${commandMarkdown("npx @verbatra/cli <command>")}\n`,
    );
  });
});

import { remarkNpm } from "fumadocs-core/mdx-plugins/remark-npm";
import { NPM_FENCE_LANG } from "./install-commands";

export const PACKAGE_MANAGER_GROUP = "package-manager";

export const TABS_COMPONENT = "CodeBlockTabs";

type TabsNode = {
  type: string;
  name?: string | null;
  lang?: string | null;
  value?: string;
  children?: TabsNode[];
  data?: Record<string, unknown>;
};

export function npmFenceMarkdown(command: string): string {
  return `\`\`\`bash\n${command}\n\`\`\``;
}

function collectNpmCommands(node: TabsNode, found: string[]): void {
  if (node.type === "code" && node.lang === NPM_FENCE_LANG) found.push(node.value ?? "");
  for (const child of node.children ?? []) collectNpmCommands(child, found);
}

function markTabs(node: TabsNode, commands: string[]): void {
  if (node.type === "mdxJsxFlowElement" && node.name === TABS_COMPONENT) {
    const command = commands.shift();
    if (command !== undefined) {
      node.data = { ...node.data, _stringify: { text: npmFenceMarkdown(command) } };
    }
    return;
  }
  for (const child of node.children ?? []) markTabs(child, commands);
}

type NpmTransformer = ReturnType<typeof remarkNpm>;

export function remarkPackageManagerTabs() {
  const toTabs: NpmTransformer = remarkNpm({ persist: { id: PACKAGE_MANAGER_GROUP } });
  return (...[root, file, next]: Parameters<NpmTransformer>): void => {
    const commands: string[] = [];
    collectNpmCommands(root as TabsNode, commands);
    if (commands.length === 0) return;
    toTabs(root, file, next);
    markTabs(root as TabsNode, commands);
  };
}

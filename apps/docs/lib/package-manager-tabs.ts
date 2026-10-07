import { remarkNpm } from "fumadocs-core/mdx-plugins/remark-npm";
import { CLI_PACKAGE, NPM_FENCE_LANG, RUN_FENCE_LANG } from "./install-commands";

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

type NpmOptions = NonNullable<Parameters<typeof remarkNpm>[0]>;
type PackageManager = NonNullable<NpmOptions["packageManagers"]>[number];
type NpmTransformer = ReturnType<typeof remarkNpm>;
type NpmTree = Parameters<NpmTransformer>[0];

export function runCommand(args: string): string {
  return `npx ${CLI_PACKAGE} ${args}`;
}

const RUN_MANAGERS: PackageManager[] = [
  { name: "npm", command: runCommand },
  { name: "pnpm", command: (args) => `pnpm verbatra ${args}` },
  { name: "yarn", command: (args) => `yarn verbatra ${args}` },
  { name: "bun", command: (args) => `bun run verbatra ${args}` },
];

export function commandMarkdown(command: string): string {
  return `\`\`\`bash\n${command}\n\`\`\``;
}

type FenceKind = { transform: NpmTransformer; markdown: (value: string) => string };

function fenceKinds(): ReadonlyMap<string, FenceKind> {
  const persist = { id: PACKAGE_MANAGER_GROUP };
  return new Map([
    [NPM_FENCE_LANG, { transform: remarkNpm({ persist }), markdown: (value) => value }],
    [
      RUN_FENCE_LANG,
      { transform: remarkNpm({ persist, packageManagers: RUN_MANAGERS }), markdown: runCommand },
    ],
  ]);
}

function toTabs(
  fence: TabsNode,
  kind: FenceKind,
  [, file, next]: Parameters<NpmTransformer>,
): TabsNode {
  const tree = { type: "root", children: [{ ...fence, lang: NPM_FENCE_LANG }] };
  kind.transform(tree as NpmTree, file, next);
  const [tabs = fence] = tree.children;
  const markdown = commandMarkdown(kind.markdown(fence.value ?? ""));
  return { ...tabs, data: { ...tabs.data, _stringify: { text: markdown } } };
}

export function remarkPackageManagerTabs() {
  const kinds = fenceKinds();
  return (...args: Parameters<NpmTransformer>): void => {
    const replace = (node: TabsNode): void => {
      if (node.children === undefined) return;
      node.children = node.children.map((child) => {
        const kind = child.type === "code" ? kinds.get(child.lang ?? "") : undefined;
        if (kind !== undefined) return toTabs(child, kind, args);
        replace(child);
        return child;
      });
    };
    replace(args[0] as TabsNode);
  };
}

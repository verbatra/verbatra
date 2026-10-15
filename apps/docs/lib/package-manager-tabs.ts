import { remarkNpm } from "fumadocs-core/mdx-plugins/remark-npm";
import { CLI_PACKAGE, NPM_FENCE_LANG, RUN_FENCE_LANG } from "./install-commands";
import { fencedMarkdown, replaceMarkdown } from "./llm-markdown";

export const PACKAGE_MANAGER_GROUP = "package-manager";

export const TABS_COMPONENT = "CodeBlockTabs";

type TabsNode = {
  type: string;
  name?: string | null;
  lang?: string | null;
  value?: string;
  children?: TabsNode[];
};

type NpmOptions = NonNullable<Parameters<typeof remarkNpm>[0]>;
type PackageManager = NonNullable<NpmOptions["packageManagers"]>[number];
type NpmTransformer = ReturnType<typeof remarkNpm>;
type NpmTree = Parameters<NpmTransformer>[0];

function runCommand(args: string): string {
  return `npx ${CLI_PACKAGE} ${args}`;
}

const RUN_MANAGERS: PackageManager[] = [
  { name: "npm", command: runCommand },
  { name: "pnpm", command: (args) => `pnpm verbatra ${args}` },
  { name: "yarn", command: (args) => `yarn verbatra ${args}` },
  { name: "bun", command: (args) => `bun run verbatra ${args}` },
];

export function commandMarkdown(command: string): string {
  return fencedMarkdown("bash", null, command);
}

const FENCE_COMMANDS: ReadonlyMap<string, (value: string) => string> = new Map([
  [NPM_FENCE_LANG, (value: string) => value],
  [RUN_FENCE_LANG, runCommand],
]);

export function packageManagerFenceMarkdown(
  lang: string | null | undefined,
  value: string,
): string | undefined {
  const command = FENCE_COMMANDS.get(lang ?? "");
  return command === undefined ? undefined : commandMarkdown(command(value));
}

type FenceKind = { transform: NpmTransformer; lang: string };

function fenceKinds(): ReadonlyMap<string, FenceKind> {
  const persist = { id: PACKAGE_MANAGER_GROUP };
  return new Map([
    [NPM_FENCE_LANG, { transform: remarkNpm({ persist }), lang: NPM_FENCE_LANG }],
    [
      RUN_FENCE_LANG,
      { transform: remarkNpm({ persist, packageManagers: RUN_MANAGERS }), lang: RUN_FENCE_LANG },
    ],
  ]);
}

function toTabs(
  fence: TabsNode,
  kind: FenceKind,
  [, file, next]: Parameters<NpmTransformer>,
): TabsNode {
  const markdown = packageManagerFenceMarkdown(kind.lang, fence.value ?? "") ?? "";
  fence.lang = NPM_FENCE_LANG;
  const tree = { type: "root", children: [fence] };
  kind.transform(tree as NpmTree, file, next);
  replaceMarkdown(file, fence, markdown);
  const [tabs = fence] = tree.children;
  return tabs;
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

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

type FenceKind = { command: (value: string) => string; packageManagers?: PackageManager[] };

const FENCE_KINDS: ReadonlyMap<string, FenceKind> = new Map<string, FenceKind>([
  [NPM_FENCE_LANG, { command: (value) => value }],
  [RUN_FENCE_LANG, { command: runCommand, packageManagers: RUN_MANAGERS }],
]);

export function packageManagerFenceMarkdown(
  lang: string | null | undefined,
  value: string,
): string | undefined {
  const kind = FENCE_KINDS.get(lang ?? "");
  return kind === undefined ? undefined : commandMarkdown(kind.command(value));
}

type FenceTabs = { kind: FenceKind; transform: NpmTransformer };

function fenceTabs(): ReadonlyMap<string, FenceTabs> {
  const persist = { id: PACKAGE_MANAGER_GROUP };
  return new Map(
    [...FENCE_KINDS].map(([lang, kind]) => {
      const { packageManagers } = kind;
      const options = packageManagers === undefined ? { persist } : { persist, packageManagers };
      return [lang, { kind, transform: remarkNpm(options) }];
    }),
  );
}

function toTabs(
  fence: TabsNode,
  { kind, transform }: FenceTabs,
  [, file, next]: Parameters<NpmTransformer>,
): TabsNode {
  const markdown = commandMarkdown(kind.command(fence.value ?? ""));
  fence.lang = NPM_FENCE_LANG;
  const tree = { type: "root", children: [fence] };
  transform(tree as NpmTree, file, next);
  replaceMarkdown(file, fence, markdown);
  const [tabs = fence] = tree.children;
  return tabs;
}

export function remarkPackageManagerTabs() {
  const tabsByLang = fenceTabs();
  return (...args: Parameters<NpmTransformer>): void => {
    const replace = (node: TabsNode): void => {
      if (node.children === undefined) return;
      node.children = node.children.map((child) => {
        const tabs = child.type === "code" ? tabsByLang.get(child.lang ?? "") : undefined;
        if (tabs !== undefined) return toTabs(child, tabs, args);
        replace(child);
        return child;
      });
    };
    replace(args[0] as TabsNode);
  };
}

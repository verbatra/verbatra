import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { remarkNpm } from "fumadocs-core/mdx-plugins";
import { describe, expect, it } from "vitest";
import {
  INSTALL_COMMANDS,
  isPackageManagerId,
  NPM_INSTALL_COMMAND,
  PACKAGE_MANAGER_STORAGE_KEY,
} from "@/lib/install-commands";

type MdNode = {
  type: string;
  name?: string;
  lang?: string;
  value?: unknown;
  attributes?: ReadonlyArray<{ name: string; value: unknown }>;
  children?: MdNode[];
};

function docsFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

function docsTabs(command: string): Record<string, string> {
  const tree: MdNode = { type: "root", children: [{ type: "code", lang: "npm", value: command }] };
  const transform = remarkNpm({ persist: { id: PACKAGE_MANAGER_STORAGE_KEY } }) as unknown as (
    root: MdNode,
  ) => void;
  transform(tree);
  const tabs: Record<string, string> = {};
  for (const node of tree.children?.[0]?.children ?? []) {
    if (node.name !== "CodeBlockTab") continue;
    const value = node.attributes?.find((attribute) => attribute.name === "value")?.value;
    const code = node.children?.find((child) => child.type === "code")?.value;
    if (typeof value === "string" && typeof code === "string") tabs[value] = code;
  }
  return tabs;
}

describe("landing install commands", () => {
  it("match the commands the docs package-manager tabs render", () => {
    const expected = Object.fromEntries(INSTALL_COMMANDS.map((entry) => [entry.id, entry.command]));
    expect(docsTabs(NPM_INSTALL_COMMAND)).toEqual(expected);
  });

  it("use the npm command the first-translation guide installs with", () => {
    expect(docsFile("content/docs/(get-started)/quickstart.mdx")).toContain(
      `\`\`\`npm\n${NPM_INSTALL_COMMAND}\n\`\`\``,
    );
  });

  it("persist under the key the docs code tabs use", () => {
    expect(docsFile("source.config.ts")).toContain(
      `persist: { id: "${PACKAGE_MANAGER_STORAGE_KEY}" }`,
    );
  });

  it("accepts only a known package manager id", () => {
    expect(isPackageManagerId("pnpm")).toBe(true);
    expect(isPackageManagerId("deno")).toBe(false);
    expect(isPackageManagerId(null)).toBe(false);
  });
});

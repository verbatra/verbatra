import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_TOOLS_DIR = resolve(REPO_ROOT, "packages/mcp/src/tools");
const STUDIO_RPC_DIR = resolve(REPO_ROOT, "packages/studio/src/shared/rpc");
const STUDIO_DESCRIPTORS = resolve(REPO_ROOT, "packages/studio/src/webmcp/register-tools.ts");

const INTENDED_DIFFERENCES = new Map([
  [
    "project.doctor",
    "stdio only: it runs without a usable config, and Studio cannot start without one",
  ],
  ["report.provenance", "stdio only until Studio gets a provenance report tool"],
]);

function readSources(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => readFileSync(resolve(dir, file), "utf8"));
}

function mcpToolNames(registrySource, toolSources) {
  const block = /ALL_TOOLS_IN_ORDER[^=]*= \[([\s\S]*?)\];/.exec(registrySource);
  if (block?.[1] === undefined) throw new Error("ALL_TOOLS_IN_ORDER could not be located");
  return [...block[1].matchAll(/(\w+Tool)\b/g)].map(([, identifier]) => {
    const declaration = `export const ${identifier} =`;
    const source = toolSources.find((text) => text.includes(declaration));
    const name =
      source && /^ {2}name: "([^"]+)",$/m.exec(source.slice(source.indexOf(declaration)))?.[1];
    if (!name) throw new Error(`the tool ${identifier} could not be located`);
    return name;
  });
}

function studioToolNames(descriptorSource, rpcSources) {
  const block = /const TOOL_DESCRIPTORS[^=]*= \{([\s\S]*?)\n\};/.exec(descriptorSource);
  if (block?.[1] === undefined) throw new Error("TOOL_DESCRIPTORS could not be located");
  return [...block[1].matchAll(/^ {2}\[(\w+_METHOD)\]: \{/gm)].map(([, constant]) => {
    const pattern = new RegExp(`export const ${constant} = "([^"]+)";`);
    const name = rpcSources.map((text) => pattern.exec(text)?.[1]).find(Boolean);
    if (!name) throw new Error(`the method constant ${constant} could not be resolved`);
    return name;
  });
}

function symmetricDifference(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return [
    ...left.filter((name) => !rightSet.has(name)),
    ...right.filter((name) => !leftSet.has(name)),
  ].sort();
}

const registrySource = readFileSync(resolve(MCP_TOOLS_DIR, "registry.ts"), "utf8");
const toolSources = readSources(MCP_TOOLS_DIR);
const descriptorSource = readFileSync(STUDIO_DESCRIPTORS, "utf8");
const rpcSources = readSources(STUDIO_RPC_DIR);

describe("agent tool parity between the stdio MCP server and Studio", () => {
  it("reads a non-trivial tool list from each surface", () => {
    expect(mcpToolNames(registrySource, toolSources).length).toBeGreaterThan(15);
    expect(studioToolNames(descriptorSource, rpcSources).length).toBeGreaterThan(15);
  });

  it("differs only by the intended tools, each with a stated reason", () => {
    const difference = symmetricDifference(
      mcpToolNames(registrySource, toolSources),
      studioToolNames(descriptorSource, rpcSources),
    );

    expect(difference).toEqual([...INTENDED_DIFFERENCES.keys()].sort());
    for (const reason of INTENDED_DIFFERENCES.values()) {
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it("notices a tool added to the MCP server only", () => {
    const withExtra = registrySource.replace(
      "ALL_TOOLS_IN_ORDER: readonly RegisteredMcpTool[] = [",
      "ALL_TOOLS_IN_ORDER: readonly RegisteredMcpTool[] = [\n  extraTool,",
    );
    const extraSource = 'export const extraTool = defineTool({\n  name: "extra.only",\n';

    const difference = symmetricDifference(
      mcpToolNames(withExtra, [...toolSources, extraSource]),
      studioToolNames(descriptorSource, rpcSources),
    );

    expect(difference).toContain("extra.only");
  });

  it("notices a tool added to Studio only", () => {
    const withExtra = descriptorSource.replace(
      "const TOOL_DESCRIPTORS: Record<AgentMethodName, ToolDescriptor> = {",
      "const TOOL_DESCRIPTORS: Record<AgentMethodName, ToolDescriptor> = {\n  [EXTRA_METHOD]: {},",
    );
    const extraSource = 'export const EXTRA_METHOD = "studio.only";';

    const difference = symmetricDifference(
      mcpToolNames(registrySource, toolSources),
      studioToolNames(withExtra, [...rpcSources, extraSource]),
    );

    expect(difference).toContain("studio.only");
  });
});

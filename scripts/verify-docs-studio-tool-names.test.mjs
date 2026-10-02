import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO_RPC_DIR = resolve(REPO_ROOT, "packages/studio/src/shared/rpc");
const STUDIO_DESCRIPTORS = resolve(REPO_ROOT, "packages/studio/src/webmcp/register-tools.ts");
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

function rpcSources() {
  return readdirSync(STUDIO_RPC_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => readFileSync(resolve(STUDIO_RPC_DIR, file), "utf8"));
}

function methodName(constant, sources) {
  const pattern = new RegExp(`export const ${constant} = "([^"]+)";`);
  const name = sources.map((text) => pattern.exec(text)?.[1]).find(Boolean);
  if (!name) throw new Error(`the method constant ${constant} could not be resolved`);
  return name;
}

function flag(entry, field) {
  const value = new RegExp(`^ {4}${field}: (true|false),$`, "m").exec(entry)?.[1];
  if (value === undefined) throw new Error(`${field} could not be read from a tool descriptor`);
  return value === "true";
}

function toolKinds(descriptorSource, sources) {
  const block = /const TOOL_DESCRIPTORS[^=]*= \{([\s\S]*?)\n\};/.exec(descriptorSource);
  if (block?.[1] === undefined) throw new Error("TOOL_DESCRIPTORS could not be located");
  const entries = block[1].split(/^(?= {2}\[\w+_METHOD\]: \{)/m).filter((entry) => entry.trim());
  const kinds = { read: [], write: [], spend: [] };
  for (const entry of entries) {
    const constant = /^ {2}\[(\w+_METHOD)\]: \{/.exec(entry)?.[1];
    if (constant === undefined) throw new Error("a tool descriptor has no method constant");
    const tool = `verbatra_${methodName(constant, sources).replaceAll(".", "_")}`;
    if (flag(entry, "spendGated")) kinds.spend.push(tool);
    else if (flag(entry, "readOnlyHint")) kinds.read.push(tool);
    else kinds.write.push(tool);
  }
  return kinds;
}

function toolTables(page) {
  const tables = [];
  let current;
  for (const line of page.split("\n")) {
    const tool = /^\| `(verbatra_\w+)` \|/.exec(line)?.[1];
    if (tool !== undefined) {
      current ??= [];
      current.push(tool);
    } else if (!line.startsWith("|") && current !== undefined) {
      tables.push(current);
      current = undefined;
    }
  }
  if (current !== undefined) tables.push(current);
  return tables;
}

function tableKinds(page) {
  const [read = [], write = [], spend = [], ...rest] = toolTables(page);
  if (rest.length > 0) throw new Error("the page has more than three tool tables");
  return { read, write, spend };
}

function sorted(kinds) {
  return {
    read: [...kinds.read].sort(),
    write: [...kinds.write].sort(),
    spend: [...kinds.spend].sort(),
  };
}

function guidePage(suffix) {
  return readFileSync(
    resolve(REPO_ROOT, `apps/docs/content/docs/(agents)/agent-tools-in-studio${suffix}.mdx`),
    "utf8",
  );
}

const descriptorSource = readFileSync(STUDIO_DESCRIPTORS, "utf8");
const sources = rpcSources();

describe("the Studio agent tool tables", () => {
  const expected = sorted(toolKinds(descriptorSource, sources));

  it("reads read, write and spend-gated tools from TOOL_DESCRIPTORS", () => {
    expect(expected.read.length).toBeGreaterThan(10);
    expect(expected.write.length).toBeGreaterThan(0);
    expect(expected.spend.length).toBeGreaterThan(0);
    expect(expected.read).toContain("verbatra_project_snapshot");
    expect(expected.spend).toContain("verbatra_translation_translatePending");
  });

  describe.each(LOCALE_SUFFIXES)("agent-tools-in-studio%s.mdx", (suffix) => {
    it("lists every registered tool once, in the table of its kind", () => {
      expect(sorted(tableKinds(guidePage(suffix)))).toEqual(expected);
    });
  });

  it("sees a missing row, an extra row and a spend tool listed as a write tool", () => {
    const page = guidePage("");
    const missing = page.replace(/^\| `verbatra_usage_summary` \|.*\n/m, "");
    const extra = page.replace(
      /^(\| `verbatra_usage_summary` \|.*\n)/m,
      "$1| `verbatra_extra_tool` | not registered |\n",
    );
    const moved = page
      .replace(/^\| `verbatra_translation_retranslateEntry` \|.*\n/m, "")
      .replace(
        /^(\| `verbatra_translation_editEntry` \|.*\n)/m,
        "$1| `verbatra_translation_retranslateEntry` | moved |\n",
      );

    for (const variant of [missing, extra, moved]) {
      expect(variant).not.toBe(page);
      expect(sorted(tableKinds(variant))).not.toEqual(expected);
    }
  });

  it("sees a tool added to TOOL_DESCRIPTORS but not to the tables", () => {
    const withExtra = descriptorSource.replace(
      "const TOOL_DESCRIPTORS: Record<AgentMethodName, ToolDescriptor> = {",
      "const TOOL_DESCRIPTORS: Record<AgentMethodName, ToolDescriptor> = {\n  [EXTRA_METHOD]: {\n    readOnlyHint: true,\n    spendGated: false,\n  },",
    );
    const kinds = sorted(
      toolKinds(withExtra, [...sources, 'export const EXTRA_METHOD = "extra.tool";']),
    );

    expect(kinds.read).toContain("verbatra_extra_tool");
    expect(sorted(tableKinds(guidePage("")))).not.toEqual(kinds);
  });
});

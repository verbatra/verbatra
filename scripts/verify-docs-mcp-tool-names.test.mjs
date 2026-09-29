import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS_DIR = resolve(REPO_ROOT, "packages/mcp/src/tools");
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

function toolSources() {
  return readdirSync(TOOLS_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => readFileSync(resolve(TOOLS_DIR, file), "utf8"));
}

function registeredToolNames() {
  return new Set(
    toolSources().flatMap((source) =>
      [...source.matchAll(/^ {2}name: "([a-z]+\.[A-Za-z]+)",$/gm)].map((match) => match[1]),
    ),
  );
}

function registrySource() {
  return readFileSync(resolve(TOOLS_DIR, "registry.ts"), "utf8");
}

function toolNamesOf(identifiers) {
  const sources = toolSources();
  return identifiers.map((identifier) => {
    const declaration = `export const ${identifier} =`;
    const source = sources.find((text) => text.includes(declaration));
    const name =
      source && /^ {2}name: "([^"]+)",$/m.exec(source.slice(source.indexOf(declaration)))?.[1];
    if (!name) throw new Error(`the tool ${identifier} could not be located`);
    return name;
  });
}

function spendToolNames() {
  const block = /SPEND_TOOL_NAMES[^=]*= new Set\(\[([\s\S]*?)\]\)/.exec(registrySource());
  if (block?.[1] === undefined) throw new Error("SPEND_TOOL_NAMES could not be located");
  return new Set(toolNamesOf([...block[1].matchAll(/(\w+)\.name/g)].map((match) => match[1])));
}

function toolNamesInOrder() {
  const block = /ALL_TOOLS_IN_ORDER[^=]*= \[([\s\S]*?)\];/.exec(registrySource());
  if (block?.[1] === undefined) throw new Error("ALL_TOOLS_IN_ORDER could not be located");
  return toolNamesOf([...block[1].matchAll(/(\w+Tool)\b/g)].map((match) => match[1]));
}

const YES = { "": "yes", ".de": "ja", ".es": "sí", ".fr": "oui" };

function toolTableRows(page) {
  const lines = page.split("\n");
  const start = lines.findIndex((line) => line.startsWith("| `project.snapshot` |"));
  if (start === -1) return [];
  const rows = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith("|")) break;
    const cells = line.split(" | ");
    rows.push({
      name: /^\| `([^`]+)`$/.exec(cells[0])?.[1],
      spend: cells.at(-1).replace(/ \|$/, ""),
    });
  }
  return rows;
}

function readmeToolNames() {
  const readme = readFileSync(resolve(REPO_ROOT, "packages/mcp/README.md"), "utf8");
  return toolTableRows(readme).map((row) => row.name);
}

function allowlists(suffix) {
  const page = readFileSync(
    resolve(REPO_ROOT, `apps/docs/content/docs/(agents)/connect-an-mcp-client${suffix}.mdx`),
    "utf8",
  );
  return [...page.matchAll(/"tools": \[([\s\S]*?)\]/g)].map((match) =>
    [...match[1].matchAll(/"([^"]+)"/g)].map((name) => name[1]),
  );
}

describe("MCP tool names in the client setup docs", () => {
  const registered = registeredToolNames();
  const spend = spendToolNames();

  it("finds the registered tools and the spend tools", () => {
    expect(registered.size).toBeGreaterThan(10);
    expect(spend.size).toBeGreaterThan(0);
    for (const name of spend) expect(registered.has(name)).toBe(true);
  });

  describe.each(LOCALE_SUFFIXES)("connect-an-mcp-client%s.mdx", (suffix) => {
    const lists = allowlists(suffix);

    it("has a tools allowlist", () => {
      expect(lists.length).toBeGreaterThan(0);
    });

    it("names only registered tools and no spend tool in an allowlist", () => {
      for (const list of lists) {
        for (const name of list) {
          expect(registered.has(name), `${name} is not a registered MCP tool`).toBe(true);
          expect(spend.has(name), `${name} spends and must not be pre-allowed`).toBe(false);
        }
      }
    });
  });
});

describe("the MCP tool reference tables", () => {
  const ordered = toolNamesInOrder();
  const spend = spendToolNames();

  it("reads the advertised order from the registry", () => {
    expect(ordered.length).toBeGreaterThan(10);
    expect(ordered[0]).toBe("project.snapshot");
    expect(new Set(ordered)).toEqual(registeredToolNames());
  });

  describe.each(LOCALE_SUFFIXES)("cli/mcp%s.mdx", (suffix) => {
    const rows = toolTableRows(
      readFileSync(resolve(REPO_ROOT, `apps/docs/content/docs/cli/mcp${suffix}.mdx`), "utf8"),
    );

    it("has one row per registered tool, in the order the server advertises them", () => {
      expect(rows.map((row) => row.name)).toEqual(ordered);
    });

    it("marks exactly the spend-gated tools as calling a provider", () => {
      const marked = rows.filter((row) => row.spend === YES[suffix]).map((row) => row.name);

      expect(new Set(marked)).toEqual(spend);
    });
  });

  it("lists the same tools, in the same order, in the @verbatra/mcp README", () => {
    expect(readmeToolNames()).toEqual(ordered);
  });

  it("sees a dropped row and a reordered table", () => {
    const page = readFileSync(resolve(REPO_ROOT, "apps/docs/content/docs/cli/mcp.mdx"), "utf8");
    const dropped = page.replace(/^\| `usage\.summary` \|.*\n/m, "");
    const swapped = page.replace(/^(\| `status\.check` \|.*\n)(\| `status\.diff` \|.*\n)/m, "$2$1");

    expect(toolTableRows(dropped).map((row) => row.name)).not.toEqual(ordered);
    expect(toolTableRows(swapped).map((row) => row.name)).not.toEqual(ordered);
  });
});

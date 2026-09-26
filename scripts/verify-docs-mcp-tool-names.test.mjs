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

function spendToolNames() {
  const registry = readFileSync(resolve(TOOLS_DIR, "registry.ts"), "utf8");
  const block = /SPEND_TOOL_NAMES[^=]*= new Set\(\[([\s\S]*?)\]\)/.exec(registry);
  if (block?.[1] === undefined) throw new Error("SPEND_TOOL_NAMES could not be located");
  const identifiers = [...block[1].matchAll(/(\w+)\.name/g)].map((match) => match[1]);
  const sources = toolSources();
  return new Set(
    identifiers.map((identifier) => {
      const source = sources.find((text) => text.includes(`export const ${identifier}`));
      const name = source && /^ {2}name: "([^"]+)",$/m.exec(source)?.[1];
      if (!name) throw new Error(`the tool ${identifier} could not be located`);
      return name;
    }),
  );
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

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AGENT_INSTRUCTIONS } from "../packages/cli/src/agent-instructions.ts";
import { MCP_SERVER_ENTRY } from "../packages/cli/src/agent-scaffold.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

function readAgentsPage(name, suffix) {
  return readFileSync(
    resolve(REPO_ROOT, `apps/docs/content/docs/(agents)/${name}${suffix}.mdx`),
    "utf8",
  );
}

function claudeCodeProjectConfig(suffix) {
  const page = readAgentsPage("connect-an-mcp-client", suffix);
  const section = page.slice(page.indexOf("\n## Claude Code\n"));
  const block = /^```json\n([\s\S]*?)\n```$/m.exec(section);
  if (block?.[1] === undefined) {
    throw new Error(
      `no .mcp.json block in the Claude Code section of connect-an-mcp-client${suffix}.mdx`,
    );
  }
  return JSON.parse(block[1]);
}

function instructionBlocks(suffix) {
  const page = readAgentsPage("agent-recipes", suffix);
  return [...page.matchAll(/^```md\n([\s\S]*?)\n```$/gm)].map((match) => match[1]);
}

describe("the agent instruction snippet has one source", () => {
  it("starts with the heading the docs snippet opens with", () => {
    expect(AGENT_INSTRUCTIONS.startsWith("## verbatra (i18n)\n")).toBe(true);
  });

  it.each(LOCALE_SUFFIXES)(
    "prints exactly what verbatra init --agent writes in agent-recipes%s.mdx",
    (suffix) => {
      expect(instructionBlocks(suffix)).toEqual([AGENT_INSTRUCTIONS]);
    },
  );
});

describe("the scaffolded MCP server entry is the documented one", () => {
  it.each(LOCALE_SUFFIXES)(
    "matches the Claude Code .mcp.json in connect-an-mcp-client%s.mdx",
    (suffix) => {
      expect(claudeCodeProjectConfig(suffix)).toEqual({
        mcpServers: { verbatra: MCP_SERVER_ENTRY },
      });
    },
  );
});

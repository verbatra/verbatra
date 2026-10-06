import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AGENT_CLIENT_CONFIGS, AGENT_CLIENT_IDS } from "../packages/cli/src/agent-clients.ts";
import { AGENT_INSTRUCTIONS } from "../packages/cli/src/agent-instructions.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

function readAgentsPage(name, suffix) {
  return readFileSync(
    resolve(REPO_ROOT, `apps/docs/content/docs/(agents)/${name}${suffix}.mdx`),
    "utf8",
  );
}

function firstJsonBlockIn(suffix, heading) {
  const page = readAgentsPage("connect-an-mcp-client", suffix);
  const start = page.indexOf(`\n## ${heading}\n`);
  if (start === -1) {
    throw new Error(`no ## ${heading} section in connect-an-mcp-client${suffix}.mdx`);
  }
  const end = page.indexOf("\n## ", start + 1);
  const section = page.slice(start, end === -1 ? undefined : end);
  const block = /^```json[^\n]*\n([\s\S]*?)\n```$/m.exec(section);
  if (block?.[1] === undefined) {
    throw new Error(
      `no JSON block in the ${heading} section of connect-an-mcp-client${suffix}.mdx`,
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

describe("each scaffolded MCP client entry is the documented one", () => {
  const cases = LOCALE_SUFFIXES.flatMap((suffix) => AGENT_CLIENT_IDS.map((id) => [id, suffix]));

  it.each(cases)("matches the first %s JSON block in connect-an-mcp-client%s.mdx", (id, suffix) => {
    const client = AGENT_CLIENT_CONFIGS[id];
    expect(firstJsonBlockIn(suffix, client.name)).toEqual({
      [client.serversKey]: { [client.serverName]: client.server },
    });
  });
});

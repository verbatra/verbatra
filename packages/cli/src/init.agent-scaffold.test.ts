import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_INSTRUCTIONS } from "./agent-instructions.js";
import { MARKER_END, MARKER_START, MCP_SERVER_ENTRY } from "./agent-scaffold.js";
import { type InitDeps, runInit } from "./init.js";
import { captureStreams, parseEnvelope } from "./test-support.js";

const nonInteractive: InitDeps = { isTty: () => false };

interface InitAgentResult {
  readonly files: readonly { readonly path: string; readonly action: string }[];
  readonly agent: { readonly instructionsFile: string; readonly mcpServer: string } | null;
  readonly nextSteps: readonly { readonly description: string }[];
}

describe("runInit --agent", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-agent-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const read = (name: string) => readFileSync(join(dir, name), "utf8");

  async function init(extra: Record<string, unknown> = {}) {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir, yes: true, provider: "gemini", agent: true, ...extra },
      cap.streams,
      nonInteractive,
    );
    return { code, cap };
  }

  async function initJson(): Promise<InitAgentResult> {
    const { code, cap } = await init({ json: true });
    expect(code).toBe(0);
    const envelope = parseEnvelope(cap.out());
    if (!envelope.ok) {
      throw new Error(`init failed: ${envelope.code}`);
    }
    return envelope.result as InitAgentResult;
  }

  it("writes nothing for agents without the flag, and reports agent as null", async () => {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir, yes: true, provider: "gemini", json: true },
      cap.streams,
      nonInteractive,
    );
    expect(code).toBe(0);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
    const envelope = parseEnvelope(cap.out());
    expect(envelope.ok && (envelope.result as InitAgentResult).agent).toBeNull();
  });

  it("creates AGENTS.md and .mcp.json and reports each in human output", async () => {
    const { code, cap } = await init();
    expect(code).toBe(0);
    expect(read("AGENTS.md")).toBe(`${MARKER_START}\n${AGENT_INSTRUCTIONS}\n${MARKER_END}\n`);
    expect(JSON.parse(read(".mcp.json"))).toEqual({ mcpServers: { verbatra: MCP_SERVER_ENTRY } });
    expect(cap.out()).toContain("created AGENTS.md (verbatra section for coding agents)");
    expect(cap.out()).toContain("created .mcp.json (verbatra MCP server added, spending off)");
  });

  it("reports both files in the JSON result, after the config files", async () => {
    const result = await initJson();
    expect(result.files).toEqual([
      { path: "verbatra.config.ts", action: "created" },
      { path: ".env.example", action: "created" },
      { path: ".gitignore", action: "created" },
      { path: "AGENTS.md", action: "created" },
      { path: ".mcp.json", action: "created" },
    ]);
    expect(result.agent).toEqual({ instructionsFile: "AGENTS.md", mcpServer: "added" });
  });

  it("leaves every file byte-identical on a second run", async () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# House rules\n\nBe nice.\n");
    writeFileSync(
      join(dir, ".mcp.json"),
      '{\n  "mcpServers": {\n    "other": { "command": "x" }\n  }\n}\n',
    );
    await initJson();
    const names = ["CLAUDE.md", ".mcp.json", "verbatra.config.ts", ".env.example", ".gitignore"];
    const first = names.map(read);

    const again = await initJson();
    expect(names.map(read)).toEqual(first);
    expect(again.files.every((file) => file.action === "unchanged")).toBe(true);
    expect(again.agent).toEqual({ instructionsFile: "CLAUDE.md", mcpServer: "present" });
    expect(read("CLAUDE.md").startsWith("# House rules\n\nBe nice.\n\n")).toBe(true);
    expect(JSON.parse(read(".mcp.json")).mcpServers.other).toEqual({ command: "x" });
  });

  it("refreshes an outdated section in place and keeps the text around it", async () => {
    writeFileSync(
      join(dir, "AGENTS.md"),
      `intro\n${MARKER_START}\nold verbatra rules\n${MARKER_END}\noutro\n`,
    );
    const { cap } = await init();
    expect(read("AGENTS.md")).toBe(
      `intro\n${MARKER_START}\n${AGENT_INSTRUCTIONS}\n${MARKER_END}\noutro\n`,
    );
    expect(cap.out()).toContain("updated AGENTS.md");
  });

  it("keeps a differing verbatra server, says so, and names it in the next steps", async () => {
    const custom = `${JSON.stringify(
      { mcpServers: { verbatra: { command: "npx", args: ["verbatra", "mcp"] } } },
      null,
      2,
    )}\n`;
    writeFileSync(join(dir, ".mcp.json"), custom);
    const result = await initJson();
    expect(read(".mcp.json")).toBe(custom);
    expect(result.agent?.mcpServer).toBe("differs");
    expect(result.files).toContainEqual({ path: ".mcp.json", action: "unchanged" });
    expect(result.nextSteps[0]?.description).toContain("left it as it is");

    const { cap } = await init();
    expect(cap.out()).toContain(
      "unchanged .mcp.json (its verbatra server differs from the scaffold and was left as it is)",
    );
  });

  it("refuses a malformed .mcp.json before writing anything", async () => {
    writeFileSync(join(dir, ".mcp.json"), "{ not json");
    const { code, cap } = await init({ json: true });
    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({ ok: false, code: "AGENT_FILE_INVALID" });
    expect(read(".mcp.json")).toBe("{ not json");
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  });

  it("refuses broken markers before writing anything", async () => {
    writeFileSync(join(dir, "AGENTS.md"), `${MARKER_START}\nno end\n`);
    const { code, cap } = await init();
    expect(code).toBe(2);
    expect(cap.err()).toContain("AGENT_FILE_INVALID");
    expect(read("AGENTS.md")).toBe(`${MARKER_START}\nno end\n`);
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
  });

  it("writes no key value, even with one in the environment", async () => {
    process.env.GEMINI_API_KEY = "agent-scaffold-secret";
    try {
      await init();
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
    for (const name of ["AGENTS.md", ".mcp.json"]) {
      expect(read(name)).not.toContain("agent-scaffold-secret");
    }
  });
});

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_CLIENT_CONFIGS } from "./agent-clients.js";
import { AGENT_INSTRUCTIONS } from "./agent-instructions.js";
import { MARKER_END, MARKER_START } from "./agent-scaffold.js";
import { type InitDeps, runInit } from "./init.js";
import { captureStreams, parseEnvelope } from "./test-support.js";

const MCP_SERVER_ENTRY = AGENT_CLIENT_CONFIGS.claude.server;

const nonInteractive: InitDeps = { isTty: () => false };

interface InitAgentResult {
  readonly files: readonly { readonly path: string; readonly action: string }[];
  readonly configPath: string;
  readonly config: unknown;
  readonly detection: unknown;
  readonly agent: {
    readonly instructionsFile: string;
    readonly mcpServer: string;
    readonly configKept: boolean;
  } | null;
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
    expect(cap.out()).toContain(
      "created .mcp.json (Claude Code: verbatra MCP server added, spending off)",
    );
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
    expect(result.agent).toMatchObject({
      instructionsFile: "AGENTS.md",
      mcpServer: "added",
      configKept: false,
    });
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
    expect(again.agent).toMatchObject({
      instructionsFile: "CLAUDE.md",
      mcpServer: "present",
      configKept: false,
    });
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
      { mcpServers: { verbatra: { command: "npx", args: ["@verbatra/cli", "mcp"] } } },
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
      "unchanged .mcp.json (Claude Code: its verbatra server differs from the scaffold and was left as it is)",
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

describe("runInit --agent on an already configured project", () => {
  let dir: string;
  const HAND_EDITED = "export default { hand: 'edited' };\n";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-agent-kept-"));
    writeFileSync(join(dir, "verbatra.config.ts"), HAND_EDITED);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const read = (name: string) => readFileSync(join(dir, name), "utf8");

  async function run(opts: Record<string, unknown>, deps: InitDeps = nonInteractive) {
    const cap = captureStreams();
    const code = await runInit({ cwd: dir, ...opts }, cap.streams, deps);
    return { code, cap };
  }

  it("keeps the config and writes only the agent files, saying so", async () => {
    const { code, cap } = await run({ agent: true });
    expect(code).toBe(0);
    expect(read("verbatra.config.ts")).toBe(HAND_EDITED);
    expect(read("AGENTS.md")).toContain(AGENT_INSTRUCTIONS);
    expect(JSON.parse(read(".mcp.json"))).toEqual({ mcpServers: { verbatra: MCP_SERVER_ENTRY } });
    expect(existsSync(join(dir, ".env.example"))).toBe(false);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
    expect(cap.out()).toContain(
      "kept verbatra.config.ts (already configured; --agent adds only the agent files)",
    );
    expect(cap.out()).toContain("created AGENTS.md");
    expect(cap.out()).toContain(`npx @verbatra/cli doctor --cwd ${dir}`);
  });

  it("reports the kept config in the JSON result, twice, with byte-identical files", async () => {
    const first = await run({ agent: true, json: true });
    expect(first.code).toBe(0);
    const envelope = parseEnvelope(first.cap.out());
    if (!envelope.ok) {
      throw new Error(envelope.code);
    }
    const result = envelope.result as InitAgentResult;
    expect(result.files).toEqual([
      { path: "verbatra.config.ts", action: "unchanged" },
      { path: "AGENTS.md", action: "created" },
      { path: ".mcp.json", action: "created" },
    ]);
    expect(result.configPath).toBe(join(dir, "verbatra.config.ts"));
    expect(result.config).toBeNull();
    expect(result.detection).toBeNull();
    expect(result.agent).toMatchObject({
      instructionsFile: "AGENTS.md",
      mcpServer: "added",
      configKept: true,
    });
    const names = ["verbatra.config.ts", "AGENTS.md", ".mcp.json"];
    const written = names.map(read);

    const second = await run({ agent: true, json: true });
    expect(second.code).toBe(0);
    const again = parseEnvelope(second.cap.out());
    expect(again.ok && (again.result as InitAgentResult).files.map((f) => f.action)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
    expect(names.map(read)).toEqual(written);
  });

  it("never prompts at a terminal and ignores --yes", async () => {
    let asked = 0;
    const tty: InitDeps = {
      isTty: () => true,
      ask: async () => {
        asked += 1;
        return "";
      },
    };
    expect((await run({ agent: true, yes: true }, tty)).code).toBe(0);
    expect(asked).toBe(0);
  });

  it("keeps another config file verbatra reads, naming it", async () => {
    rmSync(join(dir, "verbatra.config.ts"));
    writeFileSync(join(dir, ".verbatrarc.json"), "{}\n");
    const { code, cap } = await run({ agent: true });
    expect(code).toBe(0);
    expect(cap.out()).toContain("kept .verbatrarc.json");
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
  });

  it("refuses config answers that would rewrite it, with a hint, writing nothing", async () => {
    const { code, cap } = await run({ agent: true, provider: "deepl", yes: true, json: true });
    expect(code).toBe(2);
    const envelope = parseEnvelope(cap.out());
    expect(envelope).toMatchObject({ ok: false, code: "CONFIG_EXISTS" });
    expect(!envelope.ok && envelope.message).toContain(
      "To keep it and add only the agent files, run init --agent without --force and without --provider",
    );
    expect(read("verbatra.config.ts")).toBe(HAND_EDITED);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
  });

  it("rewrites the config under --force, as init without --agent does", async () => {
    const { code, cap } = await run({ agent: true, force: true, provider: "deepl", yes: true });
    expect(code).toBe(0);
    expect(read("verbatra.config.ts")).toContain('id: "deepl"');
    expect(cap.out()).toContain("overwrote verbatra.config.ts");
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
  });

  it("keeps CONFIG_EXISTS, without the hint, when --agent is not given", async () => {
    const { code, cap } = await run({ provider: "deepl", yes: true });
    expect(code).toBe(2);
    expect(cap.err()).toContain("CONFIG_EXISTS");
    expect(cap.err()).not.toContain("--agent");
  });

  it("refuses a malformed .mcp.json without writing the instruction file", async () => {
    writeFileSync(join(dir, ".mcp.json"), "[");
    const { code, cap } = await run({ agent: true });
    expect(code).toBe(2);
    expect(cap.err()).toContain("AGENT_FILE_INVALID");
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
    expect(read(".mcp.json")).toBe("[");
  });
});

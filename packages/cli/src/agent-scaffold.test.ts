import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_CLIENT_CONFIGS } from "./agent-clients.js";
import { AGENT_INSTRUCTIONS } from "./agent-instructions.js";
import {
  MARKER_END,
  MARKER_START,
  mergeInstructions,
  mergeMcpConfig,
  planAgentScaffold,
} from "./agent-scaffold.js";
import { CliUsageError } from "./cli-usage-error.js";

const CLAUDE = AGENT_CLIENT_CONFIGS.claude;
const MCP_SERVER_ENTRY = CLAUDE.server;

const SECTION = `${MARKER_START}\n${AGENT_INSTRUCTIONS}\n${MARKER_END}`;

function expectAgentFileInvalid(run: () => unknown, fragment: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CliUsageError);
    expect((error as CliUsageError).code).toBe("AGENT_FILE_INVALID");
    expect((error as CliUsageError).message).toContain(fragment);
    return;
  }
  throw new Error("expected an AGENT_FILE_INVALID error");
}

describe("mergeInstructions", () => {
  it("creates a file holding only the marked section", () => {
    expect(mergeInstructions("AGENTS.md", undefined)).toEqual({
      content: `${SECTION}\n`,
      action: "created",
    });
  });

  it("appends the section after user content, separated by one blank line", () => {
    const merged = mergeInstructions("AGENTS.md", "# Project\n\nOur rules.\n");
    expect(merged).toEqual({
      content: `# Project\n\nOur rules.\n\n${SECTION}\n`,
      action: "updated",
    });
  });

  it("terminates a last line that has no newline before appending", () => {
    expect(mergeInstructions("AGENTS.md", "Our rules.").content).toBe(`Our rules.\n\n${SECTION}\n`);
  });

  it("adds no extra blank line after content that already ends in one", () => {
    expect(mergeInstructions("AGENTS.md", "Our rules.\n\n").content).toBe(
      `Our rules.\n\n${SECTION}\n`,
    );
  });

  it("writes into an empty file without a leading separator", () => {
    expect(mergeInstructions("AGENTS.md", "").content).toBe(`${SECTION}\n`);
  });

  it("replaces only what sits between the markers", () => {
    const existing = `# Top\n\n${MARKER_START}\nold rules\n${MARKER_END}\n\n## Bottom\nkept\n`;
    expect(mergeInstructions("AGENTS.md", existing)).toEqual({
      content: `# Top\n\n${SECTION}\n\n## Bottom\nkept\n`,
      action: "updated",
    });
  });

  it("reports an up-to-date section as unchanged, byte for byte", () => {
    const existing = `# Top\n\n${SECTION}\n## Bottom\n`;
    expect(mergeInstructions("AGENTS.md", existing)).toEqual({
      content: existing,
      action: "unchanged",
    });
  });

  it("keeps CRLF line endings for a file written with them", () => {
    const merged = mergeInstructions("AGENTS.md", "# Project\r\n");
    expect(merged.content).toBe(`# Project\r\n\r\n${SECTION.replaceAll("\n", "\r\n")}\r\n`);
    expect(mergeInstructions("AGENTS.md", merged.content).action).toBe("unchanged");
  });

  it.each([
    ["a start marker alone", `${MARKER_START}\nrules\n`],
    ["an end marker alone", `rules\n${MARKER_END}\n`],
    ["an end before the start", `${MARKER_END}\n${MARKER_START}\n`],
    ["two sections", `${SECTION}\n${SECTION}\n`],
  ])("refuses %s rather than guessing", (_label, existing) => {
    expectAgentFileInvalid(() => mergeInstructions("CLAUDE.md", existing), "CLAUDE.md");
  });
});

describe("mergeMcpConfig", () => {
  it("creates a 2-space .mcp.json with only the verbatra server", () => {
    const merged = mergeMcpConfig(CLAUDE, undefined);
    expect(merged.action).toBe("created");
    expect(merged.server).toBe("added");
    expect(merged.content).toBe(
      `${JSON.stringify({ mcpServers: { verbatra: MCP_SERVER_ENTRY } }, null, 2)}\n`,
    );
  });

  it("scaffolds the documented Claude Code project entry, with no spend switch", () => {
    expect(MCP_SERVER_ENTRY).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@verbatra/mcp"],
    });
    const content = mergeMcpConfig(CLAUDE, undefined).content;
    expect(content).not.toContain("--allow-spend");
    expect(content).not.toContain("VERBATRA_MCP_ALLOW_SPEND");
    expect(content).not.toContain("env");
  });

  it("adds the server next to other servers and top-level keys, keeping them", () => {
    const existing = `${JSON.stringify(
      { mcpServers: { other: { command: "other-server", env: { TOKEN: "kept" } } }, x: 1 },
      null,
      2,
    )}\n`;
    const merged = mergeMcpConfig(CLAUDE, existing);
    expect(merged.action).toBe("updated");
    expect(merged.server).toBe("added");
    expect(JSON.parse(merged.content)).toEqual({
      mcpServers: {
        other: { command: "other-server", env: { TOKEN: "kept" } },
        verbatra: MCP_SERVER_ENTRY,
      },
      x: 1,
    });
    expect(merged.content.endsWith("}\n")).toBe(true);
  });

  it("adds mcpServers to an object that has none", () => {
    const merged = mergeMcpConfig(CLAUDE, "{}\n");
    expect(JSON.parse(merged.content)).toEqual({ mcpServers: { verbatra: MCP_SERVER_ENTRY } });
  });

  it("keeps the indentation, line endings, and missing final newline it found", () => {
    const tabbed = '{\r\n\t"mcpServers": {}\r\n}';
    const merged = mergeMcpConfig(CLAUDE, tabbed);
    expect(merged.content).toContain('\r\n\t"mcpServers": {\r\n\t\t"verbatra"');
    expect(merged.content.endsWith("}")).toBe(true);
    expect(merged.content).not.toMatch(/[^\r]\n/);
  });

  it("reports an identical verbatra server as present and changes nothing", () => {
    const existing = JSON.stringify({
      mcpServers: { verbatra: { args: ["-y", "@verbatra/mcp"], command: "npx", type: "stdio" } },
    });
    expect(mergeMcpConfig(CLAUDE, existing)).toEqual({
      content: existing,
      action: "unchanged",
      server: "present",
    });
  });

  it("keeps a differing verbatra server instead of clobbering it", () => {
    const existing = `${JSON.stringify(
      {
        mcpServers: {
          verbatra: { command: "npx", args: ["-y", "@verbatra/mcp", "--allow-spend"] },
        },
      },
      null,
      2,
    )}\n`;
    expect(mergeMcpConfig(CLAUDE, existing)).toEqual({
      content: existing,
      action: "unchanged",
      server: "differs",
    });
  });

  it.each([
    ["is not plain JSON", '{"mcpServers": {'],
    ["does not hold a JSON object", "[]"],
    ["does not hold a JSON object", "null"],
    ["has a value under mcpServers that is not an object", '{"mcpServers": []}'],
  ])("refuses a file that %s", (reason, existing) => {
    expectAgentFileInvalid(() => mergeMcpConfig(CLAUDE, existing), reason);
  });

  it("never echoes the malformed content, which may hold a secret", () => {
    try {
      mergeMcpConfig(CLAUDE, '{"env": {"KEY": "sk-secret-value"');
    } catch (error) {
      expect((error as Error).message).not.toContain("sk-secret-value");
      return;
    }
    throw new Error("expected a refusal");
  });
});

describe("planAgentScaffold", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-agent-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates AGENTS.md when neither instruction file exists", () => {
    expect(planAgentScaffold(dir).instructions).toMatchObject({
      path: "AGENTS.md",
      action: "created",
    });
  });

  it("writes into CLAUDE.md when it is the only instruction file", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# Claude rules\n");
    expect(planAgentScaffold(dir).instructions).toMatchObject({
      path: "CLAUDE.md",
      action: "updated",
    });
  });

  it("prefers AGENTS.md when both exist and neither carries the section", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# Claude rules\n");
    writeFileSync(join(dir, "AGENTS.md"), "# Agent rules\n");
    expect(planAgentScaffold(dir).instructions.path).toBe("AGENTS.md");
  });

  it("keeps using the file that already carries the section", () => {
    writeFileSync(join(dir, "CLAUDE.md"), `${SECTION}\n`);
    writeFileSync(join(dir, "AGENTS.md"), "# Agent rules\n");
    expect(planAgentScaffold(dir).instructions).toMatchObject({
      path: "CLAUDE.md",
      action: "unchanged",
    });
  });
});

import { describe, expect, it } from "vitest";
import { AGENT_CLIENT_CONFIGS, AGENT_CLIENT_IDS, parseClientFlag } from "./agent-clients.js";
import * as lib from "./lib.js";

describe("the client configs init --agent writes", () => {
  it("covers exactly Claude Code, Cursor, VS Code, Codex and Gemini CLI", () => {
    expect(AGENT_CLIENT_IDS).toEqual(["claude", "cursor", "vscode", "codex", "gemini"]);
    expect(Object.keys(AGENT_CLIENT_CONFIGS)).toEqual([...AGENT_CLIENT_IDS]);
  });

  it("writes each client's documented project entry", () => {
    expect(AGENT_CLIENT_CONFIGS).toEqual({
      claude: {
        name: "Claude Code",
        file: ".mcp.json",
        format: "json",
        serversKey: "mcpServers",
        serverName: "verbatra",
        server: { type: "stdio", command: "npx", args: ["-y", "@verbatra/mcp"] },
      },
      cursor: {
        name: "Cursor",
        file: ".cursor/mcp.json",
        format: "json",
        serversKey: "mcpServers",
        serverName: "verbatra",
        server: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@verbatra/mcp", "--cwd", "$" + "{workspaceFolder}"],
        },
      },
      vscode: {
        name: "VS Code",
        file: ".vscode/mcp.json",
        format: "json",
        serversKey: "servers",
        serverName: "verbatra",
        server: { type: "stdio", command: "npx", args: ["-y", "@verbatra/mcp"] },
      },
      codex: {
        name: "Codex",
        file: ".codex/config.toml",
        format: "toml",
        serversKey: "mcp_servers",
        serverName: "verbatra",
        server: { command: "npx", args: ["-y", "@verbatra/mcp"], startup_timeout_sec: 60 },
      },
      gemini: {
        name: "Gemini CLI",
        file: ".gemini/settings.json",
        format: "json",
        serversKey: "mcpServers",
        serverName: "verbatra",
        server: { command: "npx", args: ["-y", "@verbatra/mcp"] },
      },
    });
  });

  it.each(AGENT_CLIENT_IDS)("keeps spending off and names no variable for %s", (id) => {
    const entry = JSON.stringify(AGENT_CLIENT_CONFIGS[id].server);
    expect(entry).not.toMatch(
      /allow-spend|ALLOW_SPEND|"env"|"env_vars"|"inputs"|"trust"|API_KEY|"cwd"/,
    );
  });

  it("is exported from the @verbatra/cli library entry", () => {
    expect(lib.AGENT_CLIENT_CONFIGS).toBe(AGENT_CLIENT_CONFIGS);
    expect(lib.AGENT_CLIENT_IDS).toBe(AGENT_CLIENT_IDS);
  });
});

describe("parseClientFlag", () => {
  it("leaves detection on when the flag is absent", () => {
    expect(parseClientFlag(undefined, true)).toBeUndefined();
    expect(parseClientFlag(undefined, false)).toBeUndefined();
  });

  it("trims, deduplicates and orders the ids", () => {
    expect(parseClientFlag(" vscode ,claude,vscode,", true)).toEqual(["claude", "vscode"]);
    expect(parseClientFlag("all", true)).toEqual(["claude", "cursor", "vscode", "codex", "gemini"]);
    expect(parseClientFlag("gemini,codex", true)).toEqual(["codex", "gemini"]);
  });
});

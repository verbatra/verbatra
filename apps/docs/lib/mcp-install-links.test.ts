import { AGENT_CLIENT_CONFIGS } from "@verbatra/cli";
import { describe, expect, it } from "vitest";
import {
  isMcpInstallClient,
  MCP_INSTALL_CLIENTS,
  mcpInstallClientName,
  mcpInstallLink,
  mcpInstallMarkdown,
  VSCODE_INSTALL_PREFIX,
} from "./mcp-install-links";

const VSCODE_LINK = mcpInstallLink(AGENT_CLIENT_CONFIGS, "vscode");

function decodeVscodeLink(link: string): unknown {
  return JSON.parse(decodeURIComponent(link.slice(VSCODE_INSTALL_PREFIX.length)));
}

describe("MCP install links", () => {
  it("offers a link for VS Code only: a Cursor link installs user-wide, where Cursor's docs (cursor.com/docs/mcp, Config interpolation) resolve the workspace-folder variable to the home folder, not the project", () => {
    expect(MCP_INSTALL_CLIENTS).toEqual(["vscode"]);
    expect(
      MCP_INSTALL_CLIENTS.map((client) => mcpInstallClientName(AGENT_CLIENT_CONFIGS, client)),
    ).toEqual(["VS Code"]);
  });

  it("builds the VS Code link from the documented URL handler and the exact .vscode/mcp.json entry", () => {
    expect(VSCODE_LINK.startsWith(VSCODE_INSTALL_PREFIX)).toBe(true);
    expect(VSCODE_INSTALL_PREFIX).toBe("vscode:mcp/install?");
    expect(decodeVscodeLink(VSCODE_LINK)).toEqual({
      name: AGENT_CLIENT_CONFIGS.vscode.serverName,
      ...AGENT_CLIENT_CONFIGS.vscode.server,
    });
  });

  it("installs the VS Code entry with spending off, no environment and no inputs", () => {
    const server = decodeVscodeLink(VSCODE_LINK);
    const serialized = JSON.stringify(server);
    expect(serialized).not.toContain("--allow-spend");
    expect(serialized).not.toMatch(/"env"|"inputs"|"envFile"|API_KEY|VERBATRA_MCP_ALLOW_SPEND/);
    expect(server).toMatchObject({ type: "stdio", command: "npx" });
  });

  it("gives the link no character that would end a Markdown link or break an href", () => {
    expect(VSCODE_LINK).not.toMatch(/[\s()<>"']/);
  });

  it("writes the link into the page's Markdown output as a plain link", () => {
    expect(mcpInstallMarkdown(AGENT_CLIENT_CONFIGS, "vscode", "Add to VS Code")).toBe(
      `[Add to VS Code](${VSCODE_LINK})`,
    );
  });

  it("recognizes only VS Code as an install client", () => {
    expect(isMcpInstallClient("vscode")).toBe(true);
    expect(isMcpInstallClient("cursor")).toBe(false);
    expect(isMcpInstallClient("claude")).toBe(false);
    expect(isMcpInstallClient(undefined)).toBe(false);
  });
});

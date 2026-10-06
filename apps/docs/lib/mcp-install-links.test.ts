import { AGENT_CLIENT_CONFIGS } from "@verbatra/cli";
import { describe, expect, it } from "vitest";
import {
  CURSOR_INSTALL_PREFIX,
  encodeCursorConfig,
  isMcpInstallClient,
  MCP_INSTALL_CLIENTS,
  MCP_INSTALL_LINKS,
  mcpInstallClientName,
  mcpInstallMarkdown,
  VSCODE_INSTALL_PREFIX,
} from "./mcp-install-links";

function decodeCursorLink(link: string): { name: string | null; config: unknown } {
  const params = new URL(link).searchParams;
  const config = params.get("config");
  return { name: params.get("name"), config: config === null ? null : JSON.parse(atob(config)) };
}

function decodeVscodeLink(link: string): unknown {
  return JSON.parse(decodeURIComponent(link.slice(VSCODE_INSTALL_PREFIX.length)));
}

function decodedServers(): Array<{ client: string; server: unknown }> {
  return [
    { client: "cursor", server: decodeCursorLink(MCP_INSTALL_LINKS.cursor).config },
    { client: "vscode", server: decodeVscodeLink(MCP_INSTALL_LINKS.vscode) },
  ];
}

describe("MCP install links", () => {
  it("offers a link for Cursor and VS Code, the two clients with a documented install link", () => {
    expect(MCP_INSTALL_CLIENTS).toEqual(["cursor", "vscode"]);
    expect(MCP_INSTALL_CLIENTS.map(mcpInstallClientName)).toEqual(["Cursor", "VS Code"]);
  });

  it("builds the Cursor link from the documented scheme, the server name and the base64 entry", () => {
    expect(MCP_INSTALL_LINKS.cursor.startsWith(CURSOR_INSTALL_PREFIX)).toBe(true);
    expect(CURSOR_INSTALL_PREFIX).toBe("cursor://anysphere.cursor-deeplink/mcp/install?");
    expect(decodeCursorLink(MCP_INSTALL_LINKS.cursor)).toEqual({
      name: AGENT_CLIENT_CONFIGS.cursor.serverName,
      config: AGENT_CLIENT_CONFIGS.cursor.server,
    });
  });

  it("keeps the base64 padding as written, like Cursor's own link generator, and escapes only + and /", () => {
    const config = MCP_INSTALL_LINKS.cursor.split("&config=")[1] ?? "";
    expect(config).toMatch(/^[A-Za-z0-9%]+=*$/);
    expect(config.replaceAll("%2B", "").replaceAll("%2F", "")).not.toContain("%");
  });

  it("escapes a + and a / in the base64 config so a query parser reads them back unchanged", () => {
    const value = "?>~?>~??";
    const raw = btoa(JSON.stringify(value));
    expect(raw).toContain("+");
    expect(raw).toContain("/");
    const encoded = encodeCursorConfig(value);
    expect(encoded).toBe(raw.replaceAll("+", "%2B").replaceAll("/", "%2F"));
    const decoded = new URL(`${CURSOR_INSTALL_PREFIX}config=${encoded}`).searchParams.get("config");
    expect(JSON.parse(atob(decoded ?? ""))).toBe(value);
  });

  it("keeps the exact project entry in the Cursor link: Cursor's docs (cursor.com/docs/mcp, Config interpolation) define the workspace-folder variable only as the folder holding the mcp.json, and no Cursor source says a user-wide server starts in the open workspace, so the page states the home-folder caveat instead of guessing", () => {
    const { config } = decodeCursorLink(MCP_INSTALL_LINKS.cursor);
    expect(config).toMatchObject({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Cursor expands this variable itself.
      args: ["-y", "@verbatra/mcp", "--cwd", "${workspaceFolder}"],
    });
  });

  it("builds the VS Code link from the documented URL handler and the exact .vscode/mcp.json entry", () => {
    expect(MCP_INSTALL_LINKS.vscode.startsWith(VSCODE_INSTALL_PREFIX)).toBe(true);
    expect(decodeVscodeLink(MCP_INSTALL_LINKS.vscode)).toEqual({
      name: AGENT_CLIENT_CONFIGS.vscode.serverName,
      ...AGENT_CLIENT_CONFIGS.vscode.server,
    });
  });

  it.each(decodedServers())(
    "installs the $client entry with spending off, no environment and no inputs",
    ({ server }) => {
      const serialized = JSON.stringify(server);
      expect(serialized).not.toContain("--allow-spend");
      expect(serialized).not.toMatch(/"env"|"inputs"|"envFile"|API_KEY|VERBATRA_MCP_ALLOW_SPEND/);
      expect(server).toMatchObject({ type: "stdio", command: "npx" });
    },
  );

  it.each(MCP_INSTALL_CLIENTS)(
    "gives the %s link no character that would end a Markdown link or break an href",
    (client) => {
      expect(MCP_INSTALL_LINKS[client]).not.toMatch(/[\s()<>"']/);
    },
  );

  it("writes each link into the page's Markdown output as a plain link", () => {
    expect(mcpInstallMarkdown("cursor", "Add to Cursor")).toBe(
      `[Add to Cursor](${MCP_INSTALL_LINKS.cursor})`,
    );
    expect(mcpInstallMarkdown("vscode", "Add to VS Code")).toBe(
      `[Add to VS Code](${MCP_INSTALL_LINKS.vscode})`,
    );
  });

  it("recognizes only the two install clients", () => {
    expect(isMcpInstallClient("cursor")).toBe(true);
    expect(isMcpInstallClient("vscode")).toBe(true);
    expect(isMcpInstallClient("claude")).toBe(false);
    expect(isMcpInstallClient(undefined)).toBe(false);
  });
});

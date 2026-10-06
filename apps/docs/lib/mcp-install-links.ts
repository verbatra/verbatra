import { AGENT_CLIENT_CONFIGS } from "@verbatra/cli";

export const MCP_INSTALL_CLIENTS = ["cursor", "vscode"] as const;

export type McpInstallClient = (typeof MCP_INSTALL_CLIENTS)[number];

export const MCP_INSTALL_COMPONENT = "McpInstallLink";

export const CURSOR_INSTALL_PREFIX = "cursor://anysphere.cursor-deeplink/mcp/install?";

export const VSCODE_INSTALL_PREFIX = "vscode:mcp/install?";

function cursorInstallLink(): string {
  const { serverName, server } = AGENT_CLIENT_CONFIGS.cursor;
  const config = btoa(JSON.stringify(server)).replaceAll("+", "%2B").replaceAll("/", "%2F");
  return `${CURSOR_INSTALL_PREFIX}name=${encodeURIComponent(serverName)}&config=${config}`;
}

function vscodeInstallLink(): string {
  const { serverName, server } = AGENT_CLIENT_CONFIGS.vscode;
  return `${VSCODE_INSTALL_PREFIX}${encodeURIComponent(JSON.stringify({ name: serverName, ...server }))}`;
}

export const MCP_INSTALL_LINKS: Readonly<Record<McpInstallClient, string>> = {
  cursor: cursorInstallLink(),
  vscode: vscodeInstallLink(),
};

export function mcpInstallClientName(client: McpInstallClient): string {
  return AGENT_CLIENT_CONFIGS[client].name;
}

export function isMcpInstallClient(value: unknown): value is McpInstallClient {
  return (MCP_INSTALL_CLIENTS as readonly unknown[]).includes(value);
}

export function mcpInstallMarkdown(client: McpInstallClient): string {
  return `[Add verbatra to ${mcpInstallClientName(client)}](${MCP_INSTALL_LINKS[client]})`;
}

import { AGENT_CLIENT_CONFIGS } from "@verbatra/cli";

export const MCP_INSTALL_CLIENTS = ["vscode"] as const;

export type McpInstallClient = (typeof MCP_INSTALL_CLIENTS)[number];

export const MCP_INSTALL_COMPONENT = "McpInstallLink";

export const VSCODE_INSTALL_PREFIX = "vscode:mcp/install?";

function vscodeInstallLink(): string {
  const { serverName, server } = AGENT_CLIENT_CONFIGS.vscode;
  return `${VSCODE_INSTALL_PREFIX}${encodeURIComponent(JSON.stringify({ name: serverName, ...server }))}`;
}

export const MCP_INSTALL_LINKS: Readonly<Record<McpInstallClient, string>> = {
  vscode: vscodeInstallLink(),
};

export function mcpInstallClientName(client: McpInstallClient): string {
  return AGENT_CLIENT_CONFIGS[client].name;
}

export function isMcpInstallClient(value: unknown): value is McpInstallClient {
  return (MCP_INSTALL_CLIENTS as readonly unknown[]).includes(value);
}

export function mcpInstallMarkdown(client: McpInstallClient, label: string): string {
  return `[${label}](${MCP_INSTALL_LINKS[client]})`;
}

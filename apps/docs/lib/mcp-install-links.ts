import type { AgentClientConfig } from "@verbatra/cli";

export const MCP_INSTALL_CLIENTS = ["vscode"] as const;

export type McpInstallClient = (typeof MCP_INSTALL_CLIENTS)[number];

export type McpInstallConfigs = Readonly<Record<McpInstallClient, AgentClientConfig>>;

export const MCP_INSTALL_COMPONENT = "McpInstallLink";

export const VSCODE_INSTALL_PREFIX = "vscode:mcp/install?";

export function mcpInstallLink(configs: McpInstallConfigs, client: McpInstallClient): string {
  const { serverName, server } = configs[client];
  return `${VSCODE_INSTALL_PREFIX}${encodeURIComponent(JSON.stringify({ name: serverName, ...server }))}`;
}

export function mcpInstallClientName(configs: McpInstallConfigs, client: McpInstallClient): string {
  return configs[client].name;
}

export function isMcpInstallClient(value: unknown): value is McpInstallClient {
  return (MCP_INSTALL_CLIENTS as readonly unknown[]).includes(value);
}

export function mcpInstallMarkdown(
  configs: McpInstallConfigs,
  client: McpInstallClient,
  label: string,
): string {
  return `[${label}](${mcpInstallLink(configs, client)})`;
}

import { realpathSync } from "node:fs";
import { displayPath } from "./render.js";
import type { StopCause } from "./stoppable-session.js";

export const MCP_DOCS_URL = "https://verbatra.kreitz-webdev.de/docs/cli/mcp";

function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function projectLabel(cwd: string, base: string): string {
  const real = realPath(cwd);
  const realBase = realPath(base);
  if (real === realBase) {
    return ".";
  }
  const shown = displayPath(real, realBase);
  return shown === real ? cwd : shown;
}

function onOff(enabled: boolean): string {
  return enabled ? "on" : "off";
}

export function mcpReadyLine(project: string, allowSpend: boolean): string {
  return `verbatra MCP server running on stdio (project ${project}, spend tools ${onOff(allowSpend)})`;
}

export const MCP_TERMINAL_HINT: readonly string[] = [
  "This server talks MCP over stdin and stdout and is meant to be launched by an MCP client.",
  `  add it to a client:  command "npx", args ["verbatra", "mcp"]  (${MCP_DOCS_URL})`,
  "  inspect it:          npx @modelcontextprotocol/inspector npx verbatra mcp",
  "Press Ctrl-C to stop.",
];

const MCP_STOP_REASONS: Record<StopCause, string> = {
  ended: "client closed stdin",
  requested: "interrupted",
};

export function mcpStoppedLine(cause: StopCause): string {
  return `verbatra MCP server stopped (${MCP_STOP_REASONS[cause]})`;
}

export function studioSpendLine(spend: boolean): string {
  return spend
    ? "spend tools on: Studio can call your translation provider"
    : "spend tools off (pass --allow-spend to retranslate from Studio)";
}

export function studioAgentToolsLine(exposed: boolean): string {
  return exposed
    ? "agent tools on: Studio registers its WebMCP tools in the browser"
    : "agent tools off (pass --expose-agent-tools to register them)";
}

export const PRESS_CTRL_C = "press Ctrl-C to stop";

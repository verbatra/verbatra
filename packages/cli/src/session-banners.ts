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

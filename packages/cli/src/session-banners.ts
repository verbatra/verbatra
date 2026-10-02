export function studioSpendLine(spend: boolean, machineTranslation = true): string {
  if (!spend) {
    return "spend tools off (pass --allow-spend to retranslate from Studio)";
  }
  return machineTranslation
    ? "spend tools on: Studio can call your translation provider"
    : "spend tools off (provider none)";
}

export function studioAgentToolsLine(exposed: boolean): string {
  return exposed
    ? "agent tools on: Studio registers its WebMCP tools in the browser"
    : "agent tools off (pass --expose-agent-tools to register them)";
}

export const PRESS_CTRL_C = "press Ctrl-C to stop";

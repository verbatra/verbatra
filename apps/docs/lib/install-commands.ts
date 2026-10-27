export const CLI_PACKAGE = "@verbatra/cli";

export const NPM_INSTALL_COMMAND = `npm install --save-dev ${CLI_PACKAGE}`;

export const HERO_INSTALL_COMMAND = `npm i -D ${CLI_PACKAGE}`;

export const DRY_RUN_COMMAND = `npx ${CLI_PACKAGE} translate --dry-run`;

export const AGENT_INIT_COMMAND = `npx ${CLI_PACKAGE} init --agent`;

export const AGENT_SKILLS_INSTALL_COMMAND =
  "npx -y skills@latest add verbatra/skills --skill verbatra-cli -y";

export const MCP_ADD_COMMAND =
  "claude mcp add --transport stdio --scope project verbatra -- npx -y @verbatra/mcp";

export const NPM_FENCE_LANG = "npm";

export function isNpmInstall(command: string): boolean {
  return command.startsWith("npm install ");
}

export const RUN_FENCE_LANG = "verbatra-run";

export const CLI_PACKAGE = "@verbatra/cli";

export const NPM_INSTALL_COMMAND = `npm install --save-dev ${CLI_PACKAGE}`;

export const SDK_PACKAGE = "@verbatra/sdk";

export const SDK_INSTALL_COMMAND = `npm install ${SDK_PACKAGE}`;

export const AGENT_INIT_COMMAND = "npx @verbatra/cli init --agent";

export const SKILLS_INSTALL_COMMAND =
  "npx skills@latest add verbatra/skills --skill verbatra-cli -a claude-code -y";

export const AGENT_SKILLS_INSTALL_COMMAND =
  "npx -y skills@latest add verbatra/skills --skill verbatra-cli -y";

export const NPM_FENCE_LANG = "npm";

export function isNpmInstall(command: string): boolean {
  return command.startsWith("npm install ");
}

export const RUN_FENCE_LANG = "verbatra-run";

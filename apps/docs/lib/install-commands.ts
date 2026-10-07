export const CLI_PACKAGE = "@verbatra/cli";

export const NPM_INSTALL_COMMAND = `npm install --save-dev ${CLI_PACKAGE}`;

export const AGENT_INIT_COMMAND = "npx @verbatra/cli init --agent";

export const NPM_FENCE_LANG = "npm";

export function isNpmInstall(command: string): boolean {
  return command.startsWith("npm install ");
}

export const RUN_FENCE_LANG = "verbatra-run";

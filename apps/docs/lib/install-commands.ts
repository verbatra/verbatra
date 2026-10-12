export const CLI_PACKAGE = "@verbatra/cli";

export const NPM_INSTALL_COMMAND = `npm install --save-dev ${CLI_PACKAGE}`;

export const STUDIO_RUN_COMMAND = `npx -y -p ${CLI_PACKAGE} -p @verbatra/studio verbatra studio`;

export const AGENT_INIT_COMMAND = "npx @verbatra/cli init --agent";

export const AGENT_SKILLS_INSTALL_COMMAND =
  "npx -y skills@latest add verbatra/skills --skill verbatra-cli -y";

export const NPM_FENCE_LANG = "npm";

export function isNpmInstall(command: string): boolean {
  return command.startsWith("npm install ");
}

export const RUN_FENCE_LANG = "verbatra-run";

export const PACKAGE_MANAGER_STORAGE_KEY = "package-manager";

export const CLI_PACKAGE = "@verbatra/cli";

export const NPM_INSTALL_COMMAND = `npm install --save-dev ${CLI_PACKAGE}`;

export const INSTALL_COMMANDS = [
  { id: "npm", label: "npm", command: NPM_INSTALL_COMMAND },
  { id: "pnpm", label: "pnpm", command: `pnpm add --save-dev ${CLI_PACKAGE}` },
  { id: "yarn", label: "yarn", command: `yarn add --dev ${CLI_PACKAGE}` },
  { id: "bun", label: "bun", command: `bun add --dev ${CLI_PACKAGE}` },
] as const;

export type PackageManagerId = (typeof INSTALL_COMMANDS)[number]["id"];

export function isPackageManagerId(value: string | null): value is PackageManagerId {
  return INSTALL_COMMANDS.some((manager) => manager.id === value);
}

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { scaffoldingMetadata } from "@verbatra/sdk";

const PACKAGE_JSON = "package.json";

function isInside(dir: string, ancestor: string): boolean {
  const path = relative(ancestor, dir);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function ancestorsOf(start: string): readonly string[] {
  const chain = [start];
  let current = start;
  while (dirname(current) !== current) {
    current = dirname(current);
    chain.push(current);
  }
  return chain;
}

export function configSearchChain(cwd: string, home: string = homedir()): readonly string[] {
  const start = resolve(cwd);
  const ancestors = ancestorsOf(start);
  const gitRoot = ancestors.findIndex((dir) => existsSync(join(dir, ".git")));
  if (gitRoot !== -1) {
    return ancestors.slice(0, gitRoot + 1);
  }
  const homeDir = resolve(home);
  return isInside(start, homeDir) ? ancestors.slice(0, ancestors.indexOf(homeDir) + 1) : [start];
}

function packageJsonDeclaresConfig(path: string): boolean {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof manifest === "object" && manifest !== null && "verbatra" in manifest;
  } catch {
    return false;
  }
}

function dirHasConfig(dir: string): boolean {
  return scaffoldingMetadata.configSearchPlaces.some((place) => {
    const path = join(dir, place);
    if (!existsSync(path)) {
      return false;
    }
    return place === PACKAGE_JSON ? packageJsonDeclaresConfig(path) : true;
  });
}

export function hasConfigFile(cwd: string, home?: string): boolean {
  return configSearchChain(cwd, home).some(dirHasConfig);
}

export function parentConfigDir(cwd: string, home?: string): string | undefined {
  return configSearchChain(cwd, home).slice(1).find(dirHasConfig);
}

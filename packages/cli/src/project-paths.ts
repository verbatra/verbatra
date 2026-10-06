import { lstatSync, readFileSync, realpathSync, type Stats, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

function lstatIfPresent(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

function pathPrefixes(file: string): readonly string[] {
  const parts = file.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

export function symlinkOnPath(cwd: string, file: string): string | undefined {
  return pathPrefixes(file).find((prefix) =>
    lstatIfPresent(resolve(cwd, prefix))?.isSymbolicLink(),
  );
}

export function isRegularFile(cwd: string, file: string): boolean {
  return lstatIfPresent(resolve(cwd, file))?.isFile() === true;
}

export function isDirectoryEntry(cwd: string, file: string): boolean {
  return lstatIfPresent(resolve(cwd, file))?.isDirectory() === true;
}

export function resolvesToFile(cwd: string, file: string): boolean {
  try {
    return statSync(resolve(cwd, file)).isFile();
  } catch {
    return false;
  }
}

export function resolvesToDirectory(cwd: string, file: string): boolean {
  try {
    return statSync(resolve(cwd, file)).isDirectory();
  } catch {
    return false;
  }
}

export function entryExists(cwd: string, file: string): boolean {
  return lstatIfPresent(resolve(cwd, file)) !== undefined;
}

export function escapesProject(cwd: string, file: string): boolean {
  let real: string;
  try {
    real = realpathSync(resolve(cwd, file));
  } catch {
    return false;
  }
  const inside = relative(realpathSync(cwd), real);
  return inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
}

export function readPlainProjectFile(cwd: string, file: string): string | undefined {
  if (symlinkOnPath(cwd, file) !== undefined || !isRegularFile(cwd, file)) {
    return undefined;
  }
  try {
    return readFileSync(resolve(cwd, file), "utf8");
  } catch {
    return undefined;
  }
}

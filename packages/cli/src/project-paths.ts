import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  type Stats,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

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

export function isSymlinkEntry(cwd: string, file: string): boolean {
  return lstatIfPresent(resolve(cwd, file))?.isSymbolicLink() === true;
}

export function resolvesToFile(cwd: string, file: string): boolean {
  try {
    return statSync(resolve(cwd, file)).isFile();
  } catch {
    return false;
  }
}

export function entryExists(cwd: string, file: string): boolean {
  return lstatIfPresent(resolve(cwd, file)) !== undefined;
}

export function escapesProject(cwd: string, file: string): boolean {
  const path = resolve(cwd, file);
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    return lstatIfPresent(path)?.isSymbolicLink() === true;
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

export type LinkPolicy = "never-follow" | "stay-inside";

export const LINK_OUTSIDE_PROJECT = "is a symbolic link that does not resolve inside the project";

export function linkRefusal(cwd: string, file: string, policy: LinkPolicy): string | undefined {
  if (policy === "stay-inside") {
    return escapesProject(cwd, file) ? LINK_OUTSIDE_PROJECT : undefined;
  }
  const link = symlinkOnPath(cwd, file);
  return link === undefined ? undefined : `sits behind the symbolic link ${link}`;
}

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

export function writeProjectFile(
  cwd: string,
  file: string,
  content: string,
  policy: LinkPolicy,
): void {
  const path = resolve(cwd, file);
  mkdirSync(dirname(path), { recursive: true });
  const follow = policy === "never-follow" ? NO_FOLLOW : 0;
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | follow,
    0o666,
  );
  try {
    writeFileSync(descriptor, content);
  } finally {
    closeSync(descriptor);
  }
}

import { basename, dirname, relative, resolve, sep } from "node:path";
import { CACHE_FILE_NAME } from "../cache/translation-memory.js";
import { CONFIG_SEARCH_PLACES } from "../config/load-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import type { SdkFs } from "../fs.js";
import type { LocalePathResolver } from "../locale-path/resolver.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import { escapesWorkingDirectory } from "./write-target.js";

export type ReservedPathKind =
  | "locale-file"
  | "lock-file"
  | "provenance-file"
  | "translation-memory-cache"
  | "config-search-place"
  | "loaded-config"
  | "glossary-file";

export interface ReservedPath {
  readonly path: string;
  readonly kind: ReservedPathKind;
  readonly what: string;
}

export interface ReservedPathsInput {
  readonly cwd: string;
  readonly config: VerbatraConfig;
  readonly resolver: LocalePathResolver;
  readonly configPath?: string;
  readonly glossaryPath?: string;
}

export function reservedProjectPaths(input: ReservedPathsInput): Map<string, ReservedPath> {
  const { cwd, config, resolver } = input;
  const reserved = new Map<string, ReservedPath>();
  const claim = (path: string, kind: ReservedPathKind, what: string): void => {
    reserved.set(path.toLowerCase(), { path, kind, what });
  };
  for (const locale of [config.sourceLocale, ...config.targetLocales]) {
    claim(resolver.pathFor(locale), "locale-file", `the locale file for "${locale}"`);
  }
  claim(
    resolve(cwd, LOCK_FILE_NAME),
    "lock-file",
    "the lock file, which holds the translation baseline",
  );
  claim(
    resolve(cwd, PROVENANCE_FILE_NAME),
    "provenance-file",
    "the provenance file, which records who produced each translation",
  );
  claim(resolve(cwd, CACHE_FILE_NAME), "translation-memory-cache", "the translation-memory cache");
  for (const place of CONFIG_SEARCH_PLACES) {
    claim(
      resolve(cwd, place),
      "config-search-place",
      "a file verbatra loads its configuration from",
    );
  }
  if (input.configPath !== undefined) {
    claim(
      resolve(cwd, input.configPath),
      "loaded-config",
      "the configuration file this run loaded",
    );
  }
  if (input.glossaryPath !== undefined) {
    claim(resolve(cwd, input.glossaryPath), "glossary-file", "the glossary file the config names");
  }
  return reserved;
}

export function reservedPathAt(
  reserved: ReadonlyMap<string, ReservedPath>,
  path: string,
): ReservedPath | undefined {
  return reserved.get(path.toLowerCase());
}

export function namesNoFile(requested: string): boolean {
  return requested.trim() === "" || requested.endsWith("/") || requested.endsWith(sep);
}

async function canonicalPath(
  realpath: (path: string) => Promise<string>,
  path: string,
): Promise<string> {
  const missing: string[] = [];
  let current = path;
  while (true) {
    try {
      return resolve(await realpath(current), ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return path;
      }
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

export type WorkingDirectoryConflict = "working-directory" | "outside-working-directory";

export const WORKING_DIRECTORY_REASON = "names the working directory itself.";

export function workingDirectoryConflict(
  root: string,
  target: string,
): WorkingDirectoryConflict | undefined {
  const inside = relative(root, target);
  if (inside === "") {
    return "working-directory";
  }
  return escapesWorkingDirectory(inside) ? "outside-working-directory" : undefined;
}

export type CanonicalOutputConflict =
  | { readonly kind: WorkingDirectoryConflict }
  | { readonly kind: "reserved"; readonly reserved: ReservedPath };

export async function canonicalOutputConflict(
  fs: SdkFs,
  cwd: string,
  outputPath: string,
  reserved: ReadonlyMap<string, ReservedPath>,
): Promise<CanonicalOutputConflict | undefined> {
  const realpath = fs.realpath?.bind(fs);
  if (realpath === undefined) {
    return undefined;
  }
  const root = await canonicalPath(realpath, cwd);
  const target = await canonicalPath(realpath, outputPath);
  const place = workingDirectoryConflict(root, target);
  if (place !== undefined) {
    return { kind: place };
  }
  const key = target.toLowerCase();
  for (const entry of reserved.values()) {
    if ((await canonicalPath(realpath, entry.path)).toLowerCase() === key) {
      return { kind: "reserved", reserved: entry };
    }
  }
  return undefined;
}

export type OutputPathRefusal =
  | { readonly kind: WorkingDirectoryConflict; readonly linked: boolean }
  | { readonly kind: "reserved"; readonly reserved: ReservedPath; readonly linked: boolean };

export async function outputPathRefusal(
  fs: SdkFs,
  cwd: string,
  outputPath: string,
  reserved: ReadonlyMap<string, ReservedPath>,
): Promise<OutputPathRefusal | undefined> {
  const place = workingDirectoryConflict(cwd, outputPath);
  if (place !== undefined) {
    return { kind: place, linked: false };
  }
  const claimed = reservedPathAt(reserved, outputPath);
  if (claimed !== undefined) {
    return { kind: "reserved", reserved: claimed, linked: false };
  }
  const conflict = await canonicalOutputConflict(fs, cwd, outputPath, reserved);
  return conflict === undefined ? undefined : { ...conflict, linked: true };
}

export function outputRefusalReason(refusal: OutputPathRefusal): string {
  if (refusal.kind === "reserved") {
    return refusal.linked
      ? `resolves to ${refusal.reserved.what} through a symbolic link.`
      : `is ${refusal.reserved.what}.`;
  }
  if (refusal.kind === "working-directory") {
    return WORKING_DIRECTORY_REASON;
  }
  return refusal.linked
    ? "resolves outside the working directory through a symbolic link."
    : "is not inside the working directory.";
}

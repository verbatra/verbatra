import { resolve, sep } from "node:path";
import { CACHE_FILE_NAME } from "../cache/translation-memory.js";
import { CONFIG_SEARCH_PLACES } from "../config/load-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import type { LocalePathResolver } from "../locale-path/resolver.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";

export type ReservedPathKind =
  | "locale-file"
  | "lock-file"
  | "translation-memory-cache"
  | "config-search-place"
  | "loaded-config"
  | "glossary-file";

export interface ReservedPath {
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
    reserved.set(path.toLowerCase(), { kind, what });
  };
  for (const locale of [config.sourceLocale, ...config.targetLocales]) {
    claim(resolver.pathFor(locale), "locale-file", `the locale file for "${locale}"`);
  }
  claim(
    resolve(cwd, LOCK_FILE_NAME),
    "lock-file",
    "the lock file, which holds the translation baseline",
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

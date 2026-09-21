import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cosmiconfig } from "cosmiconfig";
import { TypeScriptLoader } from "cosmiconfig-typescript-loader";
import type { z } from "zod";
import { errorMessage, SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { resolveSelfPackageAliases } from "./module-aliases.js";
import { type GlossaryProvenance, resolveGlossary } from "./resolve-glossary.js";
import { type VerbatraConfig, type VerbatraConfigInput, verbatraConfigSchema } from "./schema.js";

const MODULE_NAME = "verbatra";

export const CONFIG_SEARCH_PLACES = [
  "package.json",
  `.${MODULE_NAME}rc`,
  `.${MODULE_NAME}rc.json`,
  `.${MODULE_NAME}rc.yaml`,
  `.${MODULE_NAME}rc.yml`,
  `.${MODULE_NAME}rc.js`,
  `.${MODULE_NAME}rc.cjs`,
  `.${MODULE_NAME}rc.ts`,
  `${MODULE_NAME}.config.js`,
  `${MODULE_NAME}.config.cjs`,
  `${MODULE_NAME}.config.ts`,
];

/** Options for {@link loadConfig} and {@link loadConfigWithMeta}. */
export interface LoadConfigOptions {
  /** Directory to search from, and the base for relative paths. Defaults to the process working directory. */
  readonly cwd?: string;
  /**
   * A config object to validate directly instead of reading any file. Takes precedence over
   * `configPath` and over searching. Useful for embedding verbatra in a tool that already holds the
   * configuration in memory.
   */
  readonly configOverride?: unknown;
  /** An explicit config file to load, bypassing the search. A missing file is an error rather than a fallback to search. */
  readonly configPath?: string;
  /** File-system port used to read the glossary file. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/**
 * Where a loaded config came from, reported by {@link loadConfigWithMeta}. A tool can use it to
 * show which file is in effect, or to tell a real file apart from an in-memory override.
 */
export type ConfigSource =
  | {
      /**
       * `search` means cosmiconfig found the file by walking up from the working directory, up to
       * the nearest `.git` directory; `explicit` means the caller named it through `configPath`.
       */
      readonly kind: "search" | "explicit";
      /** The absolute path of the config file that was loaded. */
      readonly filepath: string;
    }
  | {
      /** The config came from `configOverride`, so no file was read. */
      readonly kind: "override";
    };

/** A validated config together with the provenance of the config itself and of its glossary. */
export interface LoadedConfig {
  /** The validated, fully resolved config, with any glossary file already read into a term map. */
  readonly config: VerbatraConfig;
  /** Where the config itself came from. */
  readonly source: ConfigSource;
  /** Where the glossary came from, if the config declared one. */
  readonly glossary: GlossaryProvenance;
}

function isAncestorOrSelf(ancestor: string, startDir: string): boolean {
  const target = resolve(ancestor);
  let dir = resolve(startDir);
  while (true) {
    if (dir === target) {
      return true;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return false;
    }
    dir = parent;
  }
}

function findSearchStopDir(startDir: string): string {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  const home = resolve(homedir());
  return isAncestorOrSelf(home, startDir) ? home : resolve(startDir);
}

function collectSearchChain(startDir: string, stopDir: string): ReadonlySet<string> {
  const stop = resolve(stopDir);
  const chain = new Set<string>();
  let dir = resolve(startDir);
  while (dir !== stop) {
    chain.add(dir);
    const parent = dirname(dir);
    /* v8 ignore next 3 -- findSearchStopDir only ever returns a `.git` ancestor, the home
    directory when it is a real ancestor of startDir, or startDir itself, so stop is always
    reached before the filesystem root; this guard is purely defensive against future misuse. */
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  chain.add(stop);
  return chain;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      const base = path.length > 0 ? `${path}: ${issue.message}` : issue.message;
      return issue.code === "unrecognized_keys"
        ? `${base} (API keys are read from the environment, not the config)`
        : base;
    })
    .join("; ");
}

function parseConfig(input: unknown): VerbatraConfigInput {
  const parsed = verbatraConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new SdkError(
      "CONFIG_INVALID",
      `The verbatra configuration is invalid: ${formatIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

async function finalizeConfig(
  parsed: VerbatraConfigInput,
  baseDir: string,
  fs: SdkFs,
): Promise<{ config: VerbatraConfig; glossary: GlossaryProvenance }> {
  const { glossary: glossaryInput, ...rest } = parsed;
  const resolved = await resolveGlossary(glossaryInput, baseDir, fs);
  const config: VerbatraConfig = {
    ...rest,
    ...(resolved.glossary !== undefined ? { glossary: resolved.glossary } : {}),
  };
  return { config, glossary: resolved.provenance };
}

async function loadExplicitWithMeta(
  explorer: ReturnType<typeof cosmiconfig>,
  configPath: string,
  cwd: string | undefined,
  fs: SdkFs,
): Promise<LoadedConfig> {
  const resolved = resolve(cwd ?? process.cwd(), configPath);
  if (!existsSync(resolved)) {
    throw new SdkError("CONFIG_NOT_FOUND", `No verbatra configuration file at ${resolved}.`);
  }

  let result: Awaited<ReturnType<typeof explorer.load>>;
  try {
    result = await explorer.load(resolved);
  } catch (error) {
    const detail = errorMessage(error);
    throw new SdkError("CONFIG_INVALID", `Failed to load the verbatra configuration: ${detail}`);
  }

  const parsed = parseConfig(result?.config);
  const { config, glossary } = await finalizeConfig(parsed, dirname(resolved), fs);
  return { config, source: { kind: "explicit", filepath: resolved }, glossary };
}

/**
 * Loads and validates the project config, and additionally reports where it came from and where its
 * glossary came from. Use this over {@link loadConfig} when a tool needs to show the user which
 * config file is in effect, or to distinguish an inline glossary from a glossary file.
 *
 * Resolution order is: an explicit `configOverride`, then an explicit `configPath`, then a
 * cosmiconfig search upward from `cwd` across `verbatra.config.ts`, the `.verbatrarc` family, and a
 * `verbatra` property in `package.json`. The upward search stops at the nearest ancestor directory
 * containing a `.git` entry; if none is found, it stops at the user's home directory when that is an
 * ancestor of `cwd`, and otherwise it does not search above `cwd` at all, so a nested workspace
 * package finds a config at its monorepo root without wandering above it, and a project outside the
 * home directory tree (a CI checkout, for instance) never triggers an unbounded walk to the
 * filesystem root. A config file outside that directory chain, including cosmiconfig's own OS-level
 * global config directory, is never used, even though the underlying search strategy checks it; it is
 * treated the same as no config found. A `configPath` that does not exist is an error rather than a
 * fallback to searching, so a typo in a path never silently loads a different project's config.
 *
 * A glossary given as a path is read and validated here, so the returned config always carries a
 * resolved term map.
 *
 * A `verbatra.config.ts` file is transpiled and loaded through jiti. When it imports `@verbatra/sdk`
 * or `@verbatra/cli`, those bare specifiers are aliased to the package that is actually running this
 * function, so the import resolves to the running version even when a different, conflicting version
 * of either package also happens to be reachable from the config file's own location. A package is
 * only aliased when its own entry point can be resolved from the running code; otherwise the import
 * falls back to jiti's ordinary bare-specifier resolution, unchanged from before this behavior existed.
 *
 * @param options - Where and how to look for the config.
 * @returns The validated config with its config-source and glossary provenance.
 *
 * @throws {@link SdkError} `CONFIG_NOT_FOUND`: no config was found by search, or the explicit
 * `configPath` does not exist.
 * @throws {@link SdkError} `CONFIG_INVALID`: the config could not be loaded or fails validation, or
 * its glossary file is missing, oversized, not UTF-8, not valid JSON, or not a flat string map.
 */
export async function loadConfigWithMeta(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const fs = options.fs ?? defaultFs;

  if (options.configOverride !== undefined) {
    const parsed = parseConfig(options.configOverride);
    const { config, glossary } = await finalizeConfig(parsed, options.cwd ?? process.cwd(), fs);
    return { config, source: { kind: "override" }, glossary };
  }

  const cwd = options.cwd ?? process.cwd();
  const stopDir = findSearchStopDir(cwd);

  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: CONFIG_SEARCH_PLACES,
    loaders: { ".ts": TypeScriptLoader({ alias: resolveSelfPackageAliases() }) },
    searchStrategy: "global",
    stopDir,
  });

  if (options.configPath !== undefined) {
    return loadExplicitWithMeta(explorer, options.configPath, options.cwd, fs);
  }

  let result: Awaited<ReturnType<typeof explorer.search>>;
  try {
    result = await explorer.search(cwd);
  } catch (error) {
    const detail = errorMessage(error);
    throw new SdkError("CONFIG_INVALID", `Failed to load the verbatra configuration: ${detail}`);
  }

  if (result !== null && result.isEmpty !== true) {
    const resultDir = dirname(resolve(result.filepath));
    if (!collectSearchChain(cwd, stopDir).has(resultDir)) {
      result = null;
    }
  }

  if (result === null || result.isEmpty === true) {
    throw new SdkError(
      "CONFIG_NOT_FOUND",
      "No verbatra configuration found. Create a verbatra.config.ts, a .verbatrarc.json, or a 'verbatra' property in package.json.",
    );
  }

  const parsed = parseConfig(result.config);
  const { config, glossary } = await finalizeConfig(parsed, dirname(result.filepath), fs);
  return { config, source: { kind: "search", filepath: result.filepath }, glossary };
}

/**
 * Loads and validates the project config. This is the normal starting point for every SDK flow:
 * pass the result to {@link translate}, {@link check}, {@link diff}, or any other entry point.
 *
 * Resolution order is an explicit `configOverride`, then an explicit `configPath`, then a
 * cosmiconfig search upward from `cwd`, stopping at the nearest ancestor `.git` directory, or
 * failing that, the user's home directory when it is an ancestor of `cwd`, or failing that, `cwd`
 * itself. A glossary declared as a file path is read and validated here, so the returned
 * {@link VerbatraConfig} always carries a resolved term map.
 *
 * Reach for {@link loadConfigWithMeta} when you also need to know which file was loaded.
 *
 * @param options - Where and how to look for the config.
 * @returns The validated, fully resolved config.
 *
 * @throws {@link SdkError} `CONFIG_NOT_FOUND`: no config was found by search, or the explicit
 * `configPath` does not exist.
 * @throws {@link SdkError} `CONFIG_INVALID`: the config could not be loaded or fails validation, or
 * its glossary file is missing, oversized, not UTF-8, not valid JSON, or not a flat string map.
 *
 * @example
 * ```ts
 * import { loadConfig, translate } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const summary = await translate({ config });
 * console.log(`${summary.succeeded.length} locales up to date`);
 * ```
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<VerbatraConfig> {
  const { config } = await loadConfigWithMeta(options);
  return config;
}

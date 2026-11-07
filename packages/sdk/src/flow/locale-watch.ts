import { resolve as resolvePath } from "node:path";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import { siblingPaths } from "./git-siblings.js";
import { type LocaleGitRepositoryUnavailableReason, openGitWorkTree } from "./git-worktree.js";

/** The files that hold one locale's data. */
export interface LocaleWatchFiles {
  /** The locale. */
  readonly locale: string;
  /** The absolute path of the locale's file, then the files next to it that hold part of its data, such as the `.stringsdict` file of `apple-strings`. */
  readonly paths: readonly string[];
}

/**
 * The files git rewrites when the checked-out commit changes: `available: false` with a reason when
 * the project is not in a readable work tree, otherwise their absolute paths.
 */
export type LocaleWatchGitPaths =
  | {
      /** `false`: the repository could not be read. */
      readonly available: false;
      /** Why the repository could not be read. */
      readonly reason: LocaleGitRepositoryUnavailableReason;
    }
  | {
      /** `true`: the repository was read. */
      readonly available: true;
      /** Absolute paths of this work tree's index, `HEAD` and `HEAD` reflog, in that order. */
      readonly paths: readonly string[];
    };

/** The result of {@link localeWatchPaths}. */
export interface LocaleWatchPathsResult {
  /** Every configured locale with its files, source locale first. */
  readonly locales: readonly LocaleWatchFiles[];
  /** The files git rewrites on a commit, a branch switch, a reset or a staging operation. */
  readonly git: LocaleWatchGitPaths;
}

/** Input for {@link localeWatchPaths}. */
export interface LocaleWatchPathsInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against and git runs in. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; pass `cwd` from {@link resolveProjectRoot} for a copied config. */
  readonly cwd?: string;
}

/** Injectable dependencies for {@link localeWatchPaths}. Every field has a working default. */
export interface LocaleWatchPathsDeps {
  /** Runs `git`. Defaults to a real `child_process.execFile`. */
  readonly execFile?: GitExecFile;
}

const WATCHED_GIT_FILES = ["index", "HEAD", "logs/HEAD"] as const;
const UNSAFE_PATH = /\p{Cc}/u;

async function gitWatchPaths(execFile: GitExecFile, cwd: string): Promise<LocaleWatchGitPaths> {
  const opened = await openGitWorkTree(execFile, cwd);
  if (!opened.ok) {
    return { available: false, reason: opened.reason };
  }
  const result = await opened.tree.runner.run([
    "rev-parse",
    ...WATCHED_GIT_FILES.flatMap((name) => ["--git-path", name]),
  ]);
  if (!result.ok) {
    return { available: false, reason: result.failure.kind };
  }
  const lines = result.stdout.split("\n").filter((line) => line.length > 0);
  if (lines.length !== WATCHED_GIT_FILES.length || lines.some((line) => UNSAFE_PATH.test(line))) {
    return { available: false, reason: "git-failed" };
  }
  return { available: true, paths: lines.map((line) => resolvePath(cwd, line)) };
}

/**
 * Names the files a watcher needs to notice that what {@link localeGitStatus} reports has changed:
 * each configured locale's file with the files next to it that hold part of its data (the
 * `.stringsdict` file of `apple-strings`), and the files git rewrites when a commit, a branch
 * switch, a reset or a staging operation moves the checked-out state. It reads paths and writes
 * nothing; git is asked where this work tree keeps its index, `HEAD` and `HEAD` reflog, which also
 * answers for a linked work tree and a repository whose git directory lives elsewhere. The command
 * safeguards of {@link localeGitStatus} apply. A project outside a work tree still gets its locale
 * files, with `git.available: false`.
 *
 * @param input - The config and the project directory.
 * @param deps - Optional process runner override.
 * @returns The locale files and the git paths.
 *
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 *
 * @example
 * ```ts
 * import { loadConfig, localeWatchPaths } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const watch = await localeWatchPaths({ config });
 * console.log(watch.locales, watch.git);
 * ```
 */
export async function localeWatchPaths(
  input: LocaleWatchPathsInput,
  deps: LocaleWatchPathsDeps = {},
): Promise<LocaleWatchPathsResult> {
  const cwd = resolvePath(projectCwd(input));
  const resolver = createLocalePathResolver(cwd, input.config);
  const locales = [input.config.sourceLocale, ...input.config.targetLocales].map((locale) => {
    const path = resolver.pathFor(locale);
    return { locale, paths: [path, ...siblingPaths(input.config.format, path)] };
  });
  return { locales, git: await gitWatchPaths(deps.execFile ?? defaultGitExecFile, cwd) };
}

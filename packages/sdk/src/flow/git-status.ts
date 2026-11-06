import { relative, resolve as resolvePath, sep } from "node:path";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import {
  defaultGitExecFile,
  type GitExecFile,
  resolveWatchedPaths,
  sanitizeGitText,
} from "./git-exec.js";
import {
  type GitWorkTree,
  type LocaleGitUnavailableReason,
  openGitWorkTree,
  unavailable,
} from "./git-worktree.js";

/**
 * How git sees one watched file against `HEAD` and the index:
 *
 * - `modified`: the file changed, including a change of file type.
 * - `added`: the file is new in the index and not in `HEAD`.
 * - `deleted`: the file is gone from the working tree or the index.
 * - `untracked`: git does not track the file yet.
 * - `conflicted`: the file has unresolved merge conflicts.
 */
export type LocaleGitFileState = (typeof LOCALE_GIT_FILE_STATES)[number];

/** Every {@link LocaleGitFileState}, in the order the documentation lists them. */
export const LOCALE_GIT_FILE_STATES = Object.freeze([
  "modified",
  "added",
  "deleted",
  "untracked",
  "conflicted",
] as const);

/** One changed file in a {@link LocaleGitStatusResult}. */
export interface LocaleGitFile {
  /** The file's path relative to the project directory, with `/` separators. */
  readonly path: string;
  /**
   * The locales whose data lives in this file: one for a one-file-per-locale format, every
   * configured locale for a shared catalogue such as `apple-xcstrings`, none for
   * `verbatra.lock.json` and `verbatra.provenance.json`.
   */
  readonly locales: readonly string[];
  /** How git sees the file. */
  readonly state: LocaleGitFileState;
}

/**
 * The result of {@link localeGitStatus}: `available: false` with a reason when the repository could
 * not be read, otherwise the branch and the changed files.
 */
export type LocaleGitStatusResult =
  | {
      /** `false`: the repository could not be read. */
      readonly available: false;
      /** Why the repository could not be read. */
      readonly reason: LocaleGitUnavailableReason;
    }
  | {
      /** `true`: the repository was read. */
      readonly available: true;
      /** The checked-out branch, also on a branch with no commits yet. `null` on a detached `HEAD`. */
      readonly branch: string | null;
      /** The watched files that differ from `HEAD`, in config order; clean files are not listed. */
      readonly files: readonly LocaleGitFile[];
    };

/** Input for {@link localeGitStatus}. */
export interface LocaleGitStatusInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against and git runs in. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; pass `cwd` from {@link resolveProjectRoot} for a copied config. */
  readonly cwd?: string;
}

/** Injectable dependencies for {@link localeGitStatus}. Every field has a working default. */
export interface LocaleGitStatusDeps {
  /** Runs `git`. Defaults to a real `child_process.execFile`. */
  readonly execFile?: GitExecFile;
}

export interface WatchedFile {
  readonly path: string;
  readonly locales: readonly string[];
}

const CONFLICT_CODES: ReadonlySet<string> = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const MAX_BRANCH_CHARS = 255;

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

export function watchedFiles(cwd: string, config: VerbatraConfig): WatchedFile[] {
  const root = resolvePath(cwd);
  const resolver = createLocalePathResolver(root, config);
  const byPath = new Map<string, string[]>();
  for (const locale of [config.sourceLocale, ...config.targetLocales]) {
    const path = resolver.pathFor(locale);
    byPath.set(path, [...(byPath.get(path) ?? []), locale]);
  }
  for (const name of [LOCK_FILE_NAME, PROVENANCE_FILE_NAME]) {
    byPath.set(resolvePath(root, name), []);
  }
  return [...byPath]
    .filter(([path]) => resolveWatchedPaths(root, [path]).length === 1)
    .map(([path, locales]) => ({ path: toPosix(relative(root, path)), locales }))
    .filter((file) => file.path.length > 0);
}

export function stateOfCode(code: string): LocaleGitFileState {
  if (code === "??") {
    return "untracked";
  }
  if (CONFLICT_CODES.has(code)) {
    return "conflicted";
  }
  if (code.includes("D")) {
    return "deleted";
  }
  if (code.includes("A")) {
    return "added";
  }
  return "modified";
}

export interface PorcelainEntry {
  readonly code: string;
  readonly path: string;
}

export function parsePorcelainZ(stdout: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  for (const raw of stdout.split("\0")) {
    if (raw.length > 3 && raw[2] === " ") {
      entries.push({ code: raw.slice(0, 2), path: raw.slice(3) });
    }
  }
  return entries;
}

function foldKey(path: string): string {
  return path.normalize("NFC").toLowerCase();
}

function uniqueFolds(files: readonly WatchedFile[]): Map<string, WatchedFile> {
  const seen = new Map<string, WatchedFile>();
  const ambiguous = new Set<string>();
  for (const file of files) {
    const key = foldKey(file.path);
    if (seen.has(key)) {
      ambiguous.add(key);
    }
    seen.set(key, file);
  }
  for (const key of ambiguous) {
    seen.delete(key);
  }
  return seen;
}

export function matchWatched(
  files: readonly WatchedFile[],
  prefix: string,
  repoPath: string,
): WatchedFile | undefined {
  const normalizedPrefix = prefix.normalize("NFC");
  const normalizedPath = repoPath.normalize("NFC");
  if (!normalizedPath.startsWith(normalizedPrefix)) {
    return undefined;
  }
  const local = normalizedPath.slice(normalizedPrefix.length);
  return (
    files.find((file) => file.path.normalize("NFC") === local) ??
    uniqueFolds(files).get(foldKey(local))
  );
}

export interface FileState {
  readonly state: LocaleGitFileState;
  readonly repoPath: string;
}

export type FileStatesResult =
  | { readonly ok: true; readonly states: ReadonlyMap<string, FileState> }
  | { readonly ok: false; readonly reason: LocaleGitUnavailableReason };

export async function queryFileStates(
  tree: GitWorkTree,
  files: readonly WatchedFile[],
): Promise<FileStatesResult> {
  const result = await tree.runner.run([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--no-renames",
    "--ignore-submodules=all",
    "--",
    ...files.map((file) => file.path),
  ]);
  if (!result.ok) {
    return unavailable(result.failure);
  }
  const states = new Map<string, FileState>();
  for (const entry of parsePorcelainZ(result.stdout)) {
    const file = matchWatched(files, tree.prefix, entry.path);
    if (file !== undefined) {
      states.set(file.path, { state: stateOfCode(entry.code), repoPath: entry.path });
    }
  }
  return { ok: true, states };
}

export async function currentBranch(
  tree: GitWorkTree,
): Promise<
  | { readonly ok: true; readonly branch: string | null }
  | { readonly ok: false; readonly reason: LocaleGitUnavailableReason }
> {
  const result = await tree.runner.run(["symbolic-ref", "-q", "--short", "HEAD"]);
  if (result.ok) {
    const name = sanitizeGitText(result.stdout.trim()).slice(0, MAX_BRANCH_CHARS);
    return { ok: true, branch: name.length > 0 ? name : null };
  }
  const { exitCode, stderr } = result.failure;
  return exitCode === 1 && stderr === "" ? { ok: true, branch: null } : unavailable(result.failure);
}

/**
 * Lists which locale files, `verbatra.lock.json` and `verbatra.provenance.json` differ from the
 * last commit, each with its state, and names the checked-out branch. It writes nothing, calls no
 * provider and takes no path from the caller: the watched files come from the config.
 *
 * Git is run as an argument list, never through a shell, with optional locks off, `core.fsmonitor`
 * off, literal path matching, submodules ignored and every content filter the repository configures
 * switched off, so a repository's own configuration cannot make the call run a command. Every
 * command is stopped after {@link LOCALE_GIT_TIMEOUT_MS} and may write at most
 * {@link LOCALE_GIT_MAX_OUTPUT_BYTES}. A path beyond the project directory, or starting with a dash,
 * is never passed to git. The branch name is stripped of control and bidirectional formatting
 * characters. Renames are reported as a deleted and an added file.
 *
 * @param input - The config and the project directory.
 * @param deps - Optional process runner override.
 * @returns The branch and the changed files, or `available: false` with a
 * {@link LocaleGitUnavailableReason} when git is missing, the project is not in a work tree, git
 * refused the repository's ownership, the repository configures a filter verbatra cannot switch off,
 * or a command timed out, wrote too much or failed.
 *
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 *
 * @example
 * ```ts
 * import { loadConfig, localeGitStatus } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const status = await localeGitStatus({ config });
 * if (status.available) {
 *   for (const file of status.files) {
 *     console.log(file.state, file.path);
 *   }
 * }
 * ```
 */
export async function localeGitStatus(
  input: LocaleGitStatusInput,
  deps: LocaleGitStatusDeps = {},
): Promise<LocaleGitStatusResult> {
  const cwd = projectCwd(input);
  const files = watchedFiles(cwd, input.config);
  const opened = await openGitWorkTree(deps.execFile ?? defaultGitExecFile, resolvePath(cwd));
  if (!opened.ok) {
    return { available: false, reason: opened.reason };
  }
  const branch = await currentBranch(opened.tree);
  if (!branch.ok) {
    return { available: false, reason: branch.reason };
  }
  const queried = await queryFileStates(opened.tree, files);
  if (!queried.ok) {
    return { available: false, reason: queried.reason };
  }
  return {
    available: true,
    branch: branch.branch,
    files: files.flatMap((file) => {
      const found = queried.states.get(file.path);
      return found === undefined
        ? []
        : [{ path: file.path, locales: file.locales, state: found.state }];
    }),
  };
}

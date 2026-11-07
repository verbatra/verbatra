import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import {
  defaultGitExecFile,
  type GitExecFile,
  type LocaleHistoryResult,
  resolveWatchedPaths,
  runGitLog,
} from "./git-log.js";

/** Input for {@link localeHistory}. */
export interface LocaleHistoryInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against and git runs in. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; a copied or rebuilt config loses that root, so pass `cwd` from {@link resolveProjectRoot}. */
  readonly cwd?: string;
  /**
   * The most commits to list. Rounded down and clamped to between 1 and
   * {@link LOCALE_HISTORY_LIMIT_CAP}; defaults to {@link LOCALE_HISTORY_LIMIT_DEFAULT} when omitted
   * or not a finite number.
   */
  readonly limit?: number;
}

/** Injectable dependencies for {@link localeHistory}. Every field has a working default. */
export interface LocaleHistoryDeps {
  /** Runs `git`. Defaults to a real `child_process.execFile`. */
  readonly execFile?: GitExecFile;
}

/**
 * Lists the recent git commits that touched the source locale file or any configured target locale
 * file, newest first, each with its hash, author name, author date, subject and touched paths. It
 * writes nothing and calls no provider.
 *
 * The author is the name only, after `.mailmap`; the email address is never read. Control and
 * bidirectional formatting characters are removed from the author and the subject, and a commit
 * whose metadata does not parse as a full hash, an ISO date, an author and a subject is left out.
 * Renames are not followed, so history from before a locale file was renamed is not listed. Every
 * locale path is resolved inside `cwd`, a path that would leave `cwd` is dropped, and the rest follow
 * a `--` separator, so a config value is never read as a git option. `git log` runs with the same
 * safeguards as {@link localeGitStatus}: a minimal environment with no inherited `GIT_*` variable,
 * no bare-repository discovery, no lazy fetching from a partial clone's remote, `core.fsmonitor` and
 * every configured content filter off. Commit signature display is off and terminal prompts are
 * disabled; the command is killed after {@link LOCALE_HISTORY_TIMEOUT_MS} and may write at most
 * {@link LOCALE_HISTORY_MAX_OUTPUT_BYTES}.
 *
 * @param input - The config, the project directory, and the optional commit limit.
 * @param deps - Optional process runner override.
 * @returns The commits, or `available: false` with a {@link LocaleHistoryUnavailableReason} when
 * git is missing, `cwd` is not inside a git repository or holds a bare one, git refused the
 * repository's ownership, the repository configures a content filter that cannot be switched off,
 * a partial clone needs a newer git, or `git log` timed out or wrote too much. Any other git
 * failure, such as a branch with no commits yet, reads as an empty history.
 *
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 *
 * @example
 * ```ts
 * import { localeHistory, loadConfig } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const history = await localeHistory({ config, limit: 5 });
 * if (history.available) {
 *   for (const commit of history.commits) {
 *     console.log(commit.authorDate, commit.author, commit.subject);
 *   }
 * }
 * ```
 */
export async function localeHistory(
  input: LocaleHistoryInput,
  deps: LocaleHistoryDeps = {},
): Promise<LocaleHistoryResult> {
  const cwd = projectCwd(input);
  const resolver = createLocalePathResolver(cwd, input.config);
  const candidates = [input.config.sourceLocale, ...input.config.targetLocales].map((locale) =>
    resolver.pathFor(locale),
  );
  return runGitLog({
    execFile: deps.execFile ?? defaultGitExecFile,
    projectRoot: cwd,
    watchedPaths: resolveWatchedPaths(cwd, candidates),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  });
}

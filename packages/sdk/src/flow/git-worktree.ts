import {
  COMMIT_HASH,
  createGitRunner,
  type GitExecFile,
  type GitFailure,
  type GitRunner,
  prepareGit,
} from "./git-exec.js";

/**
 * Why {@link localeGitStatus} or {@link localeGitDiff} could not read the repository:
 *
 * - `git-missing`: no `git` executable was found.
 * - `not-a-repository`: the project is not inside a git work tree.
 * - `bare-repository`: the project folder holds a bare repository of its own, which verbatra does
 *   not open (`safe.bareRepository=explicit`), so a repository planted in a downloaded folder is refused.
 * - `dubious-ownership`: git refused the repository because another user owns it (`safe.directory`).
 * - `timeout`: a git command ran longer than {@link LOCALE_GIT_TIMEOUT_MS} and was stopped.
 * - `output-too-large`: a git command wrote more than {@link LOCALE_GIT_MAX_OUTPUT_BYTES}, or a
 *   committed locale file is larger than {@link LOCALE_GIT_BLOB_MAX_BYTES}.
 * - `unsafe-config`: the repository configures more content filters than verbatra switches off, or
 *   one whose name cannot be passed to git safely, so no command was run against it.
 * - `git-too-old`: the repository is a partial clone and git is older than 2.45, which cannot be told
 *   not to fetch missing objects from the remote, so no command was run against it.
 * - `git-failed`: git failed in a way none of the other reasons names, such as a corrupt index.
 * - `custom-adapter`: ({@link localeGitDiff} only) the format is a `custom:` adapter, or the call
 *   was given an adapter registry, so the committed file cannot be read through a private
 *   in-memory file system.
 * - `revision-unreadable`: ({@link localeGitDiff} only) the committed locale file is not a regular
 *   file or could not be parsed.
 * - `working-file-unreadable`: ({@link localeGitDiff} only) the locale file on disk is a symbolic
 *   link or sits behind one, or could not be parsed.
 * - `outside-project`: a configured locale file lies outside the project directory, for example
 *   with a `files.pattern` that starts with `../`, so the call cannot say what changed in it and
 *   does not report a partial list as a complete one.
 */
export type LocaleGitUnavailableReason = (typeof LOCALE_GIT_UNAVAILABLE_REASONS)[number];

/**
 * The {@link LocaleGitUnavailableReason}s that name a repository that could not be read: all of
 * them except the ones only {@link localeGitDiff} and {@link localeGitStatus} give about a locale
 * file (`custom-adapter`, `revision-unreadable`, `working-file-unreadable` and `outside-project`).
 */
export type LocaleGitRepositoryUnavailableReason = Exclude<
  LocaleGitUnavailableReason,
  "custom-adapter" | "revision-unreadable" | "working-file-unreadable" | "outside-project"
>;

/** Every {@link LocaleGitUnavailableReason}, in the order the documentation lists them. */
export const LOCALE_GIT_UNAVAILABLE_REASONS = Object.freeze([
  "git-missing",
  "not-a-repository",
  "bare-repository",
  "dubious-ownership",
  "timeout",
  "output-too-large",
  "unsafe-config",
  "git-too-old",
  "git-failed",
  "custom-adapter",
  "revision-unreadable",
  "working-file-unreadable",
  "outside-project",
] as const);

export interface GitWorkTree {
  readonly runner: GitRunner;
  readonly prefix: string;
  readonly head: string | undefined;
}

export type OpenWorkTreeResult =
  | { readonly ok: true; readonly tree: GitWorkTree }
  | { readonly ok: false; readonly reason: LocaleGitRepositoryUnavailableReason };

export function unavailable(failure: GitFailure): {
  readonly ok: false;
  readonly reason: LocaleGitRepositoryUnavailableReason;
} {
  return { ok: false, reason: failure.kind };
}

function parseProbe(stdout: string): { readonly inside: boolean; readonly prefix: string } {
  const newline = stdout.indexOf("\n");
  const first = newline === -1 ? stdout : stdout.slice(0, newline);
  const rest = newline === -1 ? "" : stdout.slice(newline + 1);
  return {
    inside: first === "true",
    prefix: rest.endsWith("\n") ? rest.slice(0, -1) : rest,
  };
}

type HeadResult =
  | { readonly ok: true; readonly head: string | undefined }
  | { readonly ok: false; readonly reason: LocaleGitRepositoryUnavailableReason };

const CONTROL = /\p{Cc}/u;

async function isUnbornHead(runner: GitRunner): Promise<HeadResult> {
  const named = await runner.run(["symbolic-ref", "-q", "HEAD"]);
  if (!named.ok) {
    return named.failure.exitCode === 1 && named.failure.stderr === ""
      ? { ok: false, reason: "git-failed" }
      : unavailable(named.failure);
  }
  const ref = named.stdout.trim();
  if (!ref.startsWith("refs/") || CONTROL.test(ref)) {
    return { ok: false, reason: "git-failed" };
  }
  const shown = await runner.run(["show-ref", "--verify", "-q", ref]);
  if (shown.ok) {
    return { ok: false, reason: "git-failed" };
  }
  const { exitCode, stderr } = shown.failure;
  return exitCode === 1 && stderr === ""
    ? { ok: true, head: undefined }
    : unavailable(shown.failure);
}

async function resolveHead(runner: GitRunner): Promise<HeadResult> {
  const result = await runner.run(["rev-parse", "--verify", "-q", "HEAD^{commit}"]);
  if (result.ok) {
    const hash = result.stdout.trim();
    return COMMIT_HASH.test(hash) ? { ok: true, head: hash } : { ok: false, reason: "git-failed" };
  }
  const { exitCode, stderr } = result.failure;
  return exitCode === 1 && stderr === "" ? isUnbornHead(runner) : unavailable(result.failure);
}

export async function openGitWorkTree(
  execFile: GitExecFile,
  cwd: string,
): Promise<OpenWorkTreeResult> {
  const probe = createGitRunner(execFile, cwd);
  const located = await probe.run(["rev-parse", "--is-inside-work-tree", "--show-prefix"]);
  if (!located.ok) {
    return unavailable(located.failure);
  }
  const { inside, prefix } = parseProbe(located.stdout);
  if (!inside) {
    return { ok: false, reason: "not-a-repository" };
  }
  const plan = await prepareGit(execFile, cwd);
  if (!plan.ok) {
    return unavailable(plan.failure);
  }
  const runner = createGitRunner(execFile, cwd, plan.configArgs);
  const head = await resolveHead(runner);
  return head.ok ? { ok: true, tree: { runner, prefix, head: head.head } } : head;
}

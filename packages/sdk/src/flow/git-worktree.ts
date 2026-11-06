import {
  COMMIT_HASH,
  createGitRunner,
  type GitExecFile,
  type GitFailure,
  type GitRunner,
} from "./git-exec.js";

/**
 * Why {@link localeGitStatus} or {@link localeGitDiff} could not read the repository:
 *
 * - `git-missing`: no `git` executable was found.
 * - `not-a-repository`: the project is not inside a git work tree.
 * - `dubious-ownership`: git refused the repository because another user owns it (`safe.directory`).
 * - `timeout`: a git command ran longer than {@link LOCALE_GIT_TIMEOUT_MS} and was stopped.
 * - `output-too-large`: a git command wrote more than {@link LOCALE_GIT_MAX_OUTPUT_BYTES}, or a
 *   committed locale file is larger than {@link LOCALE_GIT_BLOB_MAX_BYTES}.
 * - `unsafe-config`: the repository configures a content filter whose name verbatra cannot switch
 *   off safely, so no command was run against it.
 * - `git-failed`: git failed in a way none of the other reasons names, such as a corrupt index.
 * - `custom-adapter`: ({@link localeGitDiff} only) the format is a `custom:` adapter, or the call
 *   was given an adapter registry, so the committed file cannot be read through a private
 *   in-memory file system.
 * - `revision-unreadable`: ({@link localeGitDiff} only) the committed locale file is not a regular
 *   file or could not be parsed.
 * - `working-file-unreadable`: ({@link localeGitDiff} only) the locale file on disk is a symbolic
 *   link, lies outside the project, or could not be parsed.
 */
export type LocaleGitUnavailableReason = (typeof LOCALE_GIT_UNAVAILABLE_REASONS)[number];

/** Every {@link LocaleGitUnavailableReason}, in the order the documentation lists them. */
export const LOCALE_GIT_UNAVAILABLE_REASONS = Object.freeze([
  "git-missing",
  "not-a-repository",
  "dubious-ownership",
  "timeout",
  "output-too-large",
  "unsafe-config",
  "git-failed",
  "custom-adapter",
  "revision-unreadable",
  "working-file-unreadable",
] as const);

export interface GitWorkTree {
  readonly runner: GitRunner;
  readonly prefix: string;
  readonly head: string | undefined;
}

export type OpenWorkTreeResult =
  | { readonly ok: true; readonly tree: GitWorkTree }
  | { readonly ok: false; readonly reason: LocaleGitUnavailableReason };

export function unavailable(failure: GitFailure): {
  readonly ok: false;
  readonly reason: LocaleGitUnavailableReason;
} {
  return { ok: false, reason: failure.kind };
}

const FILTER_KEY = /^filter\.(.+)\.(clean|process|required|smudge)$/;
const FILTER_OVERRIDES = ["clean=", "process=", "required=false"] as const;

export type FilterOverrides =
  | { readonly ok: true; readonly args: readonly string[] }
  | { readonly ok: false };

export function neutralizeFilters(configKeysZ: string): FilterOverrides {
  const names = new Set<string>();
  for (const key of configKeysZ.split("\0")) {
    const name = FILTER_KEY.exec(key)?.[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  const args: string[] = [];
  for (const name of names) {
    if (name.includes("=")) {
      return { ok: false };
    }
    for (const override of FILTER_OVERRIDES) {
      args.push("-c", `filter.${name}.${override}`);
    }
  }
  return { ok: true, args };
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
  | { readonly ok: false; readonly reason: LocaleGitUnavailableReason };

async function resolveHead(runner: GitRunner): Promise<HeadResult> {
  const result = await runner.run(["rev-parse", "--verify", "-q", "HEAD^{commit}"]);
  if (result.ok) {
    const hash = result.stdout.trim();
    return COMMIT_HASH.test(hash) ? { ok: true, head: hash } : { ok: false, reason: "git-failed" };
  }
  const { exitCode, stderr } = result.failure;
  return exitCode === 1 && stderr === ""
    ? { ok: true, head: undefined }
    : unavailable(result.failure);
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
  const config = await probe.run(["config", "--list", "-z", "--name-only"]);
  if (!config.ok) {
    return unavailable(config.failure);
  }
  const overrides = neutralizeFilters(config.stdout);
  if (!overrides.ok) {
    return { ok: false, reason: "unsafe-config" };
  }
  const runner = createGitRunner(execFile, cwd, overrides.args);
  const head = await resolveHead(runner);
  return head.ok ? { ok: true, tree: { runner, prefix, head: head.head } } : head;
}

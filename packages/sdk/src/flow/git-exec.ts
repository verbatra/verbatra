import { execFile as execFileCb } from "node:child_process";
import { resolve as resolvePath, sep } from "node:path";
import { promisify } from "node:util";

/** The captured output of one {@link GitExecFile} call. */
export interface GitExecFileResult {
  /** Everything the process wrote to standard output, decoded as text. */
  readonly stdout: string;
  /** Everything the process wrote to standard error, decoded as text. */
  readonly stderr: string;
}

/**
 * An argument-array process runner, never a shell string, mirroring the shape of
 * `util.promisify(child_process.execFile)`. {@link localeHistory}, {@link localeGitStatus} and
 * {@link localeGitDiff} call it only to run `git`. Inject your own to sandbox those calls or to
 * serve the answers from somewhere else.
 *
 * @param file - The executable to run, resolved on `PATH`.
 * @param args - The arguments, passed as a list so no value is ever interpreted by a shell.
 * @param options - Where to run the process.
 * @returns The captured stdout and stderr once the process exits successfully.
 */
export type GitExecFile = (
  file: string,
  args: readonly string[],
  options: {
    /** Absolute directory to run the process in: the project root. */
    readonly cwd: string;
    /** Milliseconds after which the process is killed. A runner should honour it. */
    readonly timeout: number;
    /** The most bytes of standard output or error to accept before the process is killed. */
    readonly maxBuffer: number;
  },
) => Promise<GitExecFileResult>;

const execFileAsync = promisify(execFileCb);

export const defaultGitExecFile: GitExecFile = async (file, args, options) => {
  const { stdout, stderr } = await execFileAsync(file, args as string[], {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
  return { stdout, stderr };
};

/** How long each git command run by {@link localeGitStatus} and {@link localeGitDiff} may take, in milliseconds. */
export const LOCALE_GIT_TIMEOUT_MS = 10_000;
/** The most output {@link localeGitStatus} and {@link localeGitDiff} accept from one git command, in bytes: 1 MiB. */
export const LOCALE_GIT_MAX_OUTPUT_BYTES = 1_048_576;

export type GitFailureKind =
  | "git-missing"
  | "not-a-repository"
  | "dubious-ownership"
  | "timeout"
  | "output-too-large"
  | "git-failed";

export interface GitFailure {
  readonly kind: GitFailureKind;
  readonly exitCode: number | undefined;
  readonly stderr: string;
}

interface ExecFileFailure {
  readonly code?: string | number | null;
  readonly killed?: boolean;
  readonly signal?: string | null;
  readonly stderr?: string;
}

const NOT_A_REPOSITORY_MARKERS = ["not a git repository", "must be run in a work tree"] as const;
const DUBIOUS_OWNERSHIP_MARKER = "dubious ownership";

function includesAny(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

function kindOf(failure: ExecFileFailure, stderr: string): GitFailureKind {
  if (failure.code === "ENOENT") {
    return "git-missing";
  }
  if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return "output-too-large";
  }
  if (failure.killed === true || failure.signal === "SIGTERM") {
    return "timeout";
  }
  if (stderr.includes(DUBIOUS_OWNERSHIP_MARKER)) {
    return "dubious-ownership";
  }
  if (includesAny(stderr, NOT_A_REPOSITORY_MARKERS)) {
    return "not-a-repository";
  }
  return "git-failed";
}

export function classifyGitFailure(error: unknown): GitFailure {
  const failure = (error ?? {}) as ExecFileFailure;
  const stderr = typeof failure.stderr === "string" ? failure.stderr : "";
  return {
    kind: kindOf(failure, stderr),
    exitCode: typeof failure.code === "number" ? failure.code : undefined,
    stderr,
  };
}

export type GitRunResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly failure: GitFailure };

export interface GitLimits {
  readonly timeout?: number;
  readonly maxBuffer?: number;
}

export interface GitRunner {
  run(args: readonly string[], limits?: GitLimits): Promise<GitRunResult>;
}

const SAFE_GIT_PREFIX = [
  "--no-optional-locks",
  "--literal-pathspecs",
  "-c",
  "core.fsmonitor=false",
] as const;

export function buildSafeGitArgs(
  configOverrides: readonly string[],
  args: readonly string[],
): string[] {
  return [...SAFE_GIT_PREFIX, ...configOverrides, ...args];
}

export function createGitRunner(
  execFile: GitExecFile,
  cwd: string,
  configOverrides: readonly string[] = [],
): GitRunner {
  return {
    async run(args, limits = {}) {
      try {
        const { stdout } = await execFile("git", buildSafeGitArgs(configOverrides, args), {
          cwd,
          timeout: limits.timeout ?? LOCALE_GIT_TIMEOUT_MS,
          maxBuffer: limits.maxBuffer ?? LOCALE_GIT_MAX_OUTPUT_BYTES,
        });
        return { ok: true, stdout };
      } catch (error) {
        return { ok: false, failure: classifyGitFailure(error) };
      }
    },
  };
}

function withoutTrailingSep(path: string): string {
  return path.length > sep.length && path.endsWith(sep) ? path.slice(0, -sep.length) : path;
}

export function isPathContained(root: string, candidate: string): boolean {
  const normalizedRoot = withoutTrailingSep(root);
  return candidate === normalizedRoot || candidate.startsWith(normalizedRoot + sep);
}

export function hasLeadingDash(path: string): boolean {
  return path.startsWith("-");
}

export function resolveWatchedPaths(projectRoot: string, candidates: readonly string[]): string[] {
  const root = resolvePath(projectRoot);
  const safe = candidates
    .filter((candidate) => !hasLeadingDash(candidate))
    .map((candidate) => resolvePath(root, candidate))
    .filter((candidate) => isPathContained(root, candidate));
  return Array.from(new Set(safe));
}

export const COMMIT_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const UNSAFE_TEXT = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;

export function sanitizeGitText(text: string): string {
  return text.replace(UNSAFE_TEXT, "");
}

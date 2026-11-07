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
 * serve the answers from somewhere else. The default runner passes git a minimal environment with
 * no inherited `GIT_*` variable. A runner of your own must do the same, and must honour the
 * timeout and output limits: only the default runner guarantees them. It need not set
 * `GIT_NO_LAZY_FETCH`, since the arguments already carry `--no-lazy-fetch` on a git that knows it.
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

const ENV_ALLOW_LIST: ReadonlySet<string> = new Set([
  "PATH",
  "HOME",
  "TEMP",
  "TMP",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
]);

export function hardenedGitEnv(
  source: NodeJS.ProcessEnv = process.env,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && ENV_ALLOW_LIST.has(name.toUpperCase())) {
      env[name] = value;
    }
  }
  return { ...env, GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", LC_ALL: "C", ...extra };
}

export function gitExecFileWith(extraEnv: Readonly<Record<string, string>> = {}): GitExecFile {
  return async (file, args, options) => {
    const { stdout, stderr } = await execFileAsync(file, args as string[], {
      cwd: options.cwd,
      encoding: "utf8",
      timeout: options.timeout,
      killSignal: "SIGKILL",
      maxBuffer: options.maxBuffer,
      env: hardenedGitEnv(process.env, extraEnv),
    });
    return { stdout, stderr };
  };
}

export const defaultGitExecFile: GitExecFile = gitExecFileWith();

/** How long each git command run by {@link localeGitStatus} and {@link localeGitDiff} may take, in milliseconds. */
export const LOCALE_GIT_TIMEOUT_MS = 10_000;
/** The most output {@link localeGitStatus} and {@link localeGitDiff} accept from one git command, in bytes: 1 MiB. */
export const LOCALE_GIT_MAX_OUTPUT_BYTES = 1_048_576;

export type GitFailureKind =
  | "git-missing"
  | "not-a-repository"
  | "bare-repository"
  | "dubious-ownership"
  | "timeout"
  | "output-too-large"
  | "unsafe-config"
  | "git-too-old"
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
const BARE_REPOSITORY_MARKER = "safe.bareRepository";
const KILL_SIGNALS: ReadonlySet<string> = new Set(["SIGTERM", "SIGKILL"]);

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
  if (failure.killed === true || KILL_SIGNALS.has(failure.signal ?? "")) {
    return "timeout";
  }
  if (stderr.includes(DUBIOUS_OWNERSHIP_MARKER)) {
    return "dubious-ownership";
  }
  if (stderr.includes(BARE_REPOSITORY_MARKER)) {
    return "bare-repository";
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
  readonly config?: readonly string[];
}

export interface GitRunner {
  run(args: readonly string[], limits?: GitLimits): Promise<GitRunResult>;
}

export const SAFE_GIT_PREFIX = [
  "--no-optional-locks",
  "--literal-pathspecs",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "safe.bareRepository=explicit",
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
        const { stdout } = await execFile(
          "git",
          buildSafeGitArgs([...configOverrides, ...(limits.config ?? [])], args),
          {
            cwd,
            timeout: limits.timeout ?? LOCALE_GIT_TIMEOUT_MS,
            maxBuffer: limits.maxBuffer ?? LOCALE_GIT_MAX_OUTPUT_BYTES,
          },
        );
        return { ok: true, stdout };
      } catch (error) {
        return { ok: false, failure: classifyGitFailure(error) };
      }
    },
  };
}

const FILTER_KEY = /^filter\.(.*)\.(clean|process|required|smudge)$/s;
const PARTIAL_CLONE_KEY =
  /^(?:extensions\.partialclone|remote\..*\.(?:promisor|partialclonefilter))$/is;
const FILTER_OVERRIDES = ["clean=", "process=", "required=false"] as const;
const MAX_FILTER_DRIVERS = 128;
const REPLACEMENT_CHARACTER = "�";

export type GitConfigPlan =
  | { readonly ok: true; readonly configArgs: readonly string[] }
  | { readonly ok: false; readonly failure: GitFailure };

const UNSAFE_CONFIG: GitConfigPlan = {
  ok: false,
  failure: { kind: "unsafe-config", exitCode: undefined, stderr: "" },
};

const TOO_OLD: GitConfigPlan = {
  ok: false,
  failure: { kind: "git-too-old", exitCode: undefined, stderr: "" },
};

function cannotBeExpressed(name: string): boolean {
  return name.includes("=") || name.includes(REPLACEMENT_CHARACTER);
}

export function planGitConfig(configKeysZ: string, lazyFetchOffSupported = true): GitConfigPlan {
  const names = new Set<string>();
  let partialClone = false;
  for (const key of configKeysZ.split("\0")) {
    const name = FILTER_KEY.exec(key)?.[1];
    if (name !== undefined) {
      names.add(name);
    }
    partialClone = partialClone || PARTIAL_CLONE_KEY.test(key);
  }
  if (names.size > MAX_FILTER_DRIVERS || [...names].some(cannotBeExpressed)) {
    return UNSAFE_CONFIG;
  }
  if (partialClone && !lazyFetchOffSupported) {
    return TOO_OLD;
  }
  const configArgs: string[] = lazyFetchOffSupported ? ["--no-lazy-fetch"] : [];
  for (const name of names) {
    for (const override of FILTER_OVERRIDES) {
      configArgs.push("-c", `filter.${name}.${override}`);
    }
  }
  return { ok: true, configArgs };
}

const CONFIG_LIST = ["config", "--list", "-z", "--name-only"] as const;
const USAGE_ERROR_EXIT_CODE = 129;
const UNSUPPORTED_FLAG = /unknown option.*no-lazy-fetch/i;
const withoutLazyFetchFlag = new WeakSet<GitExecFile>();

export async function prepareGit(execFile: GitExecFile, cwd: string): Promise<GitConfigPlan> {
  const runner = createGitRunner(execFile, cwd);
  const tryFlag = !withoutLazyFetchFlag.has(execFile);
  let listed = await runner.run(tryFlag ? ["--no-lazy-fetch", ...CONFIG_LIST] : [...CONFIG_LIST]);
  if (
    tryFlag &&
    !listed.ok &&
    listed.failure.exitCode === USAGE_ERROR_EXIT_CODE &&
    UNSUPPORTED_FLAG.test(listed.failure.stderr)
  ) {
    withoutLazyFetchFlag.add(execFile);
    listed = await runner.run([...CONFIG_LIST]);
  }
  return listed.ok
    ? planGitConfig(listed.stdout, !withoutLazyFetchFlag.has(execFile))
    : { ok: false, failure: listed.failure };
}

function withoutTrailingSep(path: string): string {
  return path.length > sep.length && path.endsWith(sep) ? path.slice(0, -sep.length) : path;
}

export function isPathContained(root: string, candidate: string): boolean {
  const normalizedRoot = withoutTrailingSep(root);
  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
  return candidate === normalizedRoot || candidate.startsWith(prefix);
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
const UNSAFE_TEXT = /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

export function sanitizeGitText(text: string): string {
  return text.replace(UNSAFE_TEXT, "");
}

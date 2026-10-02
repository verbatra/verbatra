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
 * `util.promisify(child_process.execFile)`. {@link localeHistory} calls it only to run `git log`.
 * Inject your own to sandbox that call or to serve history from somewhere else.
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
  },
) => Promise<GitExecFileResult>;

/** One commit that touched a locale file, as {@link localeHistory} lists it. */
export interface LocaleHistoryCommit {
  /** The full commit hash. */
  readonly hash: string;
  /** The author's name as git records it, after `.mailmap`. Never the email address. */
  readonly author: string;
  /** The author date in strict ISO 8601. */
  readonly authorDate: string;
  /** The first line of the commit message. */
  readonly subject: string;
  /** The watched locale files the commit touched, relative to the repository root. */
  readonly touchedPaths: readonly string[];
}

/**
 * The result of {@link localeHistory}: `available: false` when git is not installed or the project
 * is not inside a git repository, otherwise the commits, newest first.
 */
export type LocaleHistoryResult =
  | { readonly available: false }
  | { readonly available: true; readonly commits: readonly LocaleHistoryCommit[] };

const execFileAsync = promisify(execFileCb);

export const defaultGitExecFile: GitExecFile = async (file, args, options) => {
  const { stdout, stderr } = await execFileAsync(file, args as string[], {
    cwd: options.cwd,
    encoding: "utf8",
  });
  return { stdout, stderr };
};

/** How many commits {@link localeHistory} lists when no `limit` is given. */
export const LOCALE_HISTORY_LIMIT_DEFAULT = 50;
/** The most commits {@link localeHistory} lists, whatever `limit` asks for. */
export const LOCALE_HISTORY_LIMIT_CAP = 200;

export function clampHistoryLimit(limit: number | undefined): number {
  return Math.min(limit ?? LOCALE_HISTORY_LIMIT_DEFAULT, LOCALE_HISTORY_LIMIT_CAP);
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

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";
const GIT_LOG_FORMAT = `${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%aN${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s`;

export function buildGitLogArgs(maxCount: number, paths: readonly string[]): string[] {
  return [
    "log",
    `--max-count=${maxCount}`,
    "--name-only",
    "-z",
    `--format=${GIT_LOG_FORMAT}`,
    "--",
    ...paths,
  ];
}

function parseCommitHeader(header: string): Omit<LocaleHistoryCommit, "touchedPaths"> | undefined {
  const [hash, author, authorDate, subject] = header.split(FIELD_SEPARATOR);
  if (
    hash === undefined ||
    author === undefined ||
    authorDate === undefined ||
    subject === undefined
  ) {
    return undefined;
  }
  return { hash, author, authorDate, subject };
}

function parseTouchedPaths(filesPart: string): string[] {
  return filesPart
    .split("\0")
    .map((entry) => (entry.startsWith("\n") ? entry.slice(1) : entry))
    .filter((entry) => entry.length > 0);
}

function parseCommitRecord(record: string): LocaleHistoryCommit | undefined {
  const nulIndex = record.indexOf("\0");
  const header = nulIndex === -1 ? record : record.slice(0, nulIndex);
  const parsedHeader = parseCommitHeader(header);
  if (parsedHeader === undefined) {
    return undefined;
  }
  const touchedPaths = nulIndex === -1 ? [] : parseTouchedPaths(record.slice(nulIndex + 1));
  return { ...parsedHeader, touchedPaths };
}

export function parseGitLogOutput(stdout: string): LocaleHistoryCommit[] {
  return stdout
    .split(RECORD_SEPARATOR)
    .filter((record) => record.length > 0)
    .map(parseCommitRecord)
    .filter((commit): commit is LocaleHistoryCommit => commit !== undefined);
}

interface ExecFileFailure {
  readonly code?: string | number;
  readonly stderr?: string;
}

function isMissingGitBinary(error: ExecFileFailure): boolean {
  return error.code === "ENOENT";
}

function isNotARepository(error: ExecFileFailure): boolean {
  return typeof error.stderr === "string" && error.stderr.includes("not a git repository");
}

function interpretGitLogFailure(error: unknown): LocaleHistoryResult {
  const failure = error as ExecFileFailure;
  if (isMissingGitBinary(failure) || isNotARepository(failure)) {
    return { available: false };
  }
  return { available: true, commits: [] };
}

export interface RunGitLogInput {
  readonly execFile: GitExecFile;
  readonly projectRoot: string;
  readonly watchedPaths: readonly string[];
  readonly limit?: number;
}

export async function runGitLog(input: RunGitLogInput): Promise<LocaleHistoryResult> {
  if (input.watchedPaths.length === 0) {
    return { available: true, commits: [] };
  }
  const args = buildGitLogArgs(clampHistoryLimit(input.limit), input.watchedPaths);
  try {
    const { stdout } = await input.execFile("git", args, { cwd: input.projectRoot });
    return { available: true, commits: parseGitLogOutput(stdout) };
  } catch (error) {
    return interpretGitLogFailure(error);
  }
}

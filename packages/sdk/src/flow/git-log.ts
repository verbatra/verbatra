import { redact } from "../redact.js";
import {
  buildSafeGitArgs,
  COMMIT_HASH,
  classifyGitFailure,
  defaultGitExecFile,
  type GitExecFile,
  type GitExecFileResult,
  type GitFailure,
  hasLeadingDash,
  isPathContained,
  prepareGit,
  resolveWatchedPaths,
  sanitizeGitText,
} from "./git-exec.js";

export {
  defaultGitExecFile,
  type GitExecFile,
  type GitExecFileResult,
  hasLeadingDash,
  isPathContained,
  resolveWatchedPaths,
  sanitizeGitText,
};

/** One commit that touched a locale file, as {@link localeHistory} lists it. */
export interface LocaleHistoryCommit {
  /** The full commit hash. */
  readonly hash: string;
  /** The author's name as git records it, after `.mailmap`, with anything shaped like an API key replaced by `[REDACTED]`, cut to 200 characters. Never the email address. */
  readonly author: string;
  /** The author date in strict ISO 8601. */
  readonly authorDate: string;
  /** The first line of the commit message, with anything shaped like an API key replaced by `[REDACTED]`, cut to 500 characters. */
  readonly subject: string;
  /** The watched locale files the commit touched, relative to the repository root. */
  readonly touchedPaths: readonly string[];
}

/**
 * Why {@link localeHistory} could not read the history:
 *
 * - `git-missing`: no `git` executable was found.
 * - `not-a-repository`: the project is not inside a git repository.
 * - `bare-repository`: the project folder holds a bare repository of its own, which is not opened.
 * - `dubious-ownership`: git refused the repository because another user owns it.
 * - `timeout`: `git log` ran longer than {@link LOCALE_HISTORY_TIMEOUT_MS} and was stopped.
 * - `output-too-large`: `git log` wrote more than {@link LOCALE_HISTORY_MAX_OUTPUT_BYTES}.
 * - `unsafe-config`: the repository configures more content filters than can be switched off, or
 *   one whose name cannot be passed to git safely.
 * - `git-too-old`: the repository is a partial clone and git is older than 2.45.
 */
export type LocaleHistoryUnavailableReason = (typeof LOCALE_HISTORY_UNAVAILABLE_REASONS)[number];

/** Every {@link LocaleHistoryUnavailableReason}, in the order the documentation lists them. */
export const LOCALE_HISTORY_UNAVAILABLE_REASONS = Object.freeze([
  "git-missing",
  "not-a-repository",
  "bare-repository",
  "dubious-ownership",
  "timeout",
  "output-too-large",
  "unsafe-config",
  "git-too-old",
] as const);

/**
 * The result of {@link localeHistory}: `available: false` with a reason when the history could not
 * be read, otherwise the commits, newest first.
 */
export type LocaleHistoryResult =
  | {
      /** `false`: the history could not be read. */
      readonly available: false;
      /** Why the history could not be read. */
      readonly reason: LocaleHistoryUnavailableReason;
    }
  | {
      /** `true`: the history was read. */
      readonly available: true;
      /** The commits that touched the locale files, newest first. */
      readonly commits: readonly LocaleHistoryCommit[];
    };

/** How long {@link localeHistory} lets `git log` run before stopping it, in milliseconds. */
export const LOCALE_HISTORY_TIMEOUT_MS = 10_000;
/** The most output {@link localeHistory} accepts from `git log`, in bytes: 8 MiB. */
export const LOCALE_HISTORY_MAX_OUTPUT_BYTES = 8_388_608;

/** How many commits {@link localeHistory} lists when no `limit` is given. */
export const LOCALE_HISTORY_LIMIT_DEFAULT = 50;
/** The most commits {@link localeHistory} lists, whatever `limit` asks for. */
export const LOCALE_HISTORY_LIMIT_CAP = 200;

export function clampHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return LOCALE_HISTORY_LIMIT_DEFAULT;
  }
  return Math.min(Math.max(Math.floor(limit), 1), LOCALE_HISTORY_LIMIT_CAP);
}

export const FIELD_SEPARATOR = "\0";
export const GIT_LOG_FORMAT = "%H%x00%aI%x00%aN%x00%s";
const HEADER_FIELD_COUNT = 4;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

export function buildGitLogArgs(maxCount: number, paths: readonly string[]): string[] {
  return [
    "-c",
    "core.quotePath=false",
    "-c",
    "i18n.logOutputEncoding=UTF-8",
    "log",
    "--no-show-signature",
    `--max-count=${maxCount}`,
    "--name-only",
    `--format=${GIT_LOG_FORMAT}`,
    "--",
    ...paths,
  ];
}

const C_ESCAPES: Readonly<Record<string, number>> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

function unquoteCPath(quoted: string): string {
  const bytes: number[] = [];
  const body = quoted.slice(1, -1);
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index] as string;
    if (char !== "\\") {
      bytes.push(...Buffer.from(char, "utf8"));
      continue;
    }
    const octal = /^[0-7]{3}/.exec(body.slice(index + 1));
    if (octal !== null) {
      bytes.push(Number.parseInt(octal[0], 8));
      index += 3;
      continue;
    }
    const next = body[index + 1] ?? "";
    bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
    index += 1;
  }
  return Buffer.from(bytes).toString("utf8");
}

function parsePathLine(line: string): string {
  return line.length >= 2 && line.startsWith('"') && line.endsWith('"') ? unquoteCPath(line) : line;
}

export const COMMIT_AUTHOR_MAX_CHARS = 200;
export const COMMIT_SUBJECT_MAX_CHARS = 500;
const COMMIT_TEXT_SCRUB_WINDOW = 16_384;

export function scrubAndClip(text: string, max: number): string {
  const scrubbed = redact(sanitizeGitText(text.slice(0, COMMIT_TEXT_SCRUB_WINDOW)));
  if (scrubbed.length <= max) {
    return scrubbed;
  }
  const lastUnit = scrubbed.charCodeAt(max - 1);
  return scrubbed.slice(0, lastUnit >= 0xd800 && lastUnit <= 0xdbff ? max - 1 : max);
}

export function parseCommitHeader(
  line: string,
): Omit<LocaleHistoryCommit, "touchedPaths"> | undefined {
  const fields = line.split(FIELD_SEPARATOR);
  if (fields.length !== HEADER_FIELD_COUNT) {
    return undefined;
  }
  const [hash = "", authorDate = "", author = "", subject = ""] = fields;
  if (!COMMIT_HASH.test(hash) || !ISO_DATE.test(authorDate)) {
    return undefined;
  }
  return {
    hash,
    author: scrubAndClip(author, COMMIT_AUTHOR_MAX_CHARS),
    authorDate,
    subject: scrubAndClip(subject, COMMIT_SUBJECT_MAX_CHARS),
  };
}

interface PendingCommit {
  readonly header: Omit<LocaleHistoryCommit, "touchedPaths"> | undefined;
  readonly touchedPaths: string[];
}

function completed(pending: PendingCommit | undefined): LocaleHistoryCommit[] {
  return pending?.header === undefined
    ? []
    : [{ ...pending.header, touchedPaths: pending.touchedPaths }];
}

export function parseGitLogOutput(stdout: string): LocaleHistoryCommit[] {
  const commits: LocaleHistoryCommit[] = [];
  let pending: PendingCommit | undefined;
  for (const line of stdout.split("\n")) {
    if (line.includes(FIELD_SEPARATOR)) {
      commits.push(...completed(pending));
      pending = { header: parseCommitHeader(line), touchedPaths: [] };
    } else if (line.length > 0 && pending !== undefined) {
      pending.touchedPaths.push(parsePathLine(line));
    }
  }
  commits.push(...completed(pending));
  return commits;
}

const HISTORY_UNAVAILABLE_REASONS: ReadonlySet<string> = new Set(
  LOCALE_HISTORY_UNAVAILABLE_REASONS,
);

function interpretGitFailure(failure: GitFailure): LocaleHistoryResult {
  const { kind } = failure;
  return HISTORY_UNAVAILABLE_REASONS.has(kind)
    ? { available: false, reason: kind as LocaleHistoryUnavailableReason }
    : { available: true, commits: [] };
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
  const plan = await prepareGit(input.execFile, input.projectRoot);
  if (!plan.ok) {
    return interpretGitFailure(plan.failure);
  }
  const args = buildSafeGitArgs(
    plan.configArgs,
    buildGitLogArgs(clampHistoryLimit(input.limit), input.watchedPaths),
  );
  try {
    const { stdout } = await input.execFile("git", args, {
      cwd: input.projectRoot,
      timeout: LOCALE_HISTORY_TIMEOUT_MS,
      maxBuffer: LOCALE_HISTORY_MAX_OUTPUT_BYTES,
    });
    return { available: true, commits: parseGitLogOutput(stdout) };
  } catch (error) {
    return interpretGitFailure(classifyGitFailure(error));
  }
}

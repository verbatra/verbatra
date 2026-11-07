import { resolve as resolvePath } from "node:path";
import { contentHash, isCustomFormatId } from "@verbatra/core";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { type KeyOrigin, keyProvenance } from "../lock/key-provenance.js";
import { parseLockFileRead } from "../lock/lock-file.js";
import { parseProvenanceRead } from "../lock/provenance-file.js";
import { ownValue } from "../record-utils.js";
import { redact } from "../redact.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readWorkingSide, type Side, type SideInput } from "./git-diff.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import {
  COMMIT_AUTHOR_MAX_CHARS,
  COMMIT_SUBJECT_MAX_CHARS,
  clampHistoryLimit,
  FIELD_SEPARATOR,
  GIT_LOG_FORMAT,
  LOCALE_HISTORY_MAX_OUTPUT_BYTES,
  LOCALE_HISTORY_TIMEOUT_MS,
  parseRawCommitHeader,
} from "./git-log.js";
import {
  type BlobStat,
  parseRevisionContent,
  readBlobBody,
  statBlobAtCommit,
} from "./git-revision.js";
import { localeLeavesProject, watchedFiles } from "./git-status.js";
import {
  type GitWorkTree,
  type LocaleGitUnavailableReason,
  openGitWorkTree,
  unavailable,
} from "./git-worktree.js";
import {
  type ByteLimits,
  localeLimits,
  planReads,
  RECORD_FILE_CAP,
  RECORD_LIMITS,
  type ReadDecision,
} from "./key-history-limits.js";
import { clipText, makeScrubber, type Scrubber } from "./key-scrub.js";
import { assertTargetLocale } from "./select-locales.js";
import { readSource } from "./source.js";
import { diffValues, type KeyHistorySegment } from "./value-diff.js";

/** The longest value {@link keyHistory} returns, in characters. A longer one is counted in `unreadableRevisions` instead. */
export const KEY_HISTORY_MAX_VALUE_CHARS = 4096;
/** The longest key {@link keyHistory} accepts, in characters. */
export const KEY_HISTORY_MAX_KEY_CHARS = 1024;
/** How long after its start {@link keyHistory} still begins a new read, in milliseconds. A read already running is not cut short. */
export const KEY_HISTORY_DEADLINE_MS = 30_000;

const READ_CONCURRENCY = 4;

function pause(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Why a {@link keyHistory} answer may be incomplete, in the order they are listed:
 * `commit-limit` (older commits exist than the limit examines), `shallow-clone`,
 * `unreadable-revision` (a commit's file could not be read or parsed, held a value that is too
 * long, or had a log line that did not parse), `file-too-large` (a commit's file was above the
 * size cap for its format), `byte-budget` (the files read in one call reached their total size
 * budget), `deadline` (the time ran out), `source-unreadable` (the source file could not be read in
 * full), `records-unreadable` (a lock-file or provenance file could not be read in full) and
 * `scrub-cap` (more distinct keys turned up than could be scrubbed from every other revision).
 */
export const KEY_HISTORY_TRUNCATION_REASONS = [
  "commit-limit",
  "shallow-clone",
  "unreadable-revision",
  "file-too-large",
  "byte-budget",
  "deadline",
  "source-unreadable",
  "records-unreadable",
  "scrub-cap",
] as const;

/** One member of {@link KEY_HISTORY_TRUNCATION_REASONS}. */
export type KeyHistoryTruncation = (typeof KEY_HISTORY_TRUNCATION_REASONS)[number];

/**
 * One commit in which a key's value changed, as {@link keyHistory} lists it.
 */
export interface KeyRevision {
  /** The full commit hash. */
  readonly commit: string;
  /** The author date in strict ISO 8601. */
  readonly authorDate: string;
  /** The author's name after `.mailmap`, never the email address, scrubbed with {@link redact} before it is cut to 200 characters. */
  readonly author: string;
  /** The first line of the commit message, scrubbed with {@link redact} before it is cut to 500 characters. */
  readonly subject: string;
  /** The key's value in that commit. Untrusted: show it as text. Anything shaped like an API key is replaced by `[REDACTED]`, and so is any other text equal to a key that {@link redact} replaced in a value, subject or author name elsewhere in the same answer. */
  readonly value: string;
  /**
   * Which write path produced the value, read from `verbatra.provenance.json` as committed with it:
   * a stored origin, `unrecorded` when that file holds no record for the key, or `external` when
   * its record describes a different value. Absent when that file could not be read or parsed, is
   * above 4 MiB, lay past the 128 MiB a call reads of lock and provenance files, or when the time
   * ran out before it was.
   */
  readonly origin?: KeyOrigin;
  /**
   * Whether the content hash of the key's current source entry (text, description, meaning,
   * plural flag and placeholders) differs from the hash the lock-file recorded for the key in that
   * commit. `unknown` when the lock-file, its entry for the key or the current source entry is not
   * available, or when the lock-file was above its size limit, did not parse or the time ran out
   * before it was read. Unlike `origin`, which compares the value with the provenance record and
   * is absent when that file cannot be used, this never depends on the value. Restoring a revision
   * whose source entry changed makes it count as up to date.
   */
  readonly sourceChanged: boolean | "unknown";
  /**
   * `true` when {@link redact} changed the value, which then holds `[REDACTED]` where a key
   * was. Such a value is not the stored text: do not offer it for restore.
   */
  readonly valueRedacted?: true;
  /** The word-level difference from the previous value of the key, both sides scrubbed with {@link redact}; the whole value when the key first appears. */
  readonly diff: readonly KeyHistorySegment[];
}

/** A value in the working tree that is not committed yet. */
export interface KeyWorkingTreeValue {
  /** The key's value on disk. Untrusted: show it as text. */
  readonly value: string;
  /** `true` when {@link redact} changed the value: it is not the stored text, so do not offer it for restore. */
  readonly valueRedacted?: true;
  /** The word-level difference from the value at `HEAD`, both sides scrubbed with {@link redact}; the whole value when `HEAD` has none. */
  readonly diff: readonly KeyHistorySegment[];
}

/**
 * The result of {@link keyHistory}: `available: false` with a reason when the history could not be
 * read, otherwise the revisions, newest first.
 */
export type KeyHistoryResult =
  | {
      /** `false`: the history could not be read. */
      readonly available: false;
      /** Why the history could not be read. */
      readonly reason: LocaleGitUnavailableReason;
    }
  | {
      /** `true`: the history was read. */
      readonly available: true;
      /** The commits in which the key's value changed, newest first. */
      readonly revisions: readonly KeyRevision[];
      /** The value on disk, present only when it differs from the value at `HEAD`. */
      readonly workingTree?: KeyWorkingTreeValue;
      /** `true` when the value on disk could not be compared with `HEAD`, so `workingTree` is absent: the file on disk does not parse, is a symbolic link or is above its size limit, its value is longer than {@link KEY_HISTORY_MAX_VALUE_CHARS}, the copy at `HEAD` could not be read (it is above its size limit, does not parse or was not reached), or the time ran out. */
      readonly workingTreeUnreadable?: true;
      /** `true` when the answer may leave history out or leave a field unknown because something was not read in full: older commits were not examined (the commit limit, the size budget of the call or the time), the clone is shallow, more than 256 distinct keys turned up and not all of them could be scrubbed from every other revision, a commit could not be read or parsed, was above its size limit or held a value that is too long, or a lock-file, provenance file or the source file could not be read, parsed or was above its size limit. `false` means every commit and record examined was read; the file on disk is reported only by `workingTreeUnreadable`. */
      readonly truncated: boolean;
      /** Why `truncated` is `true`: every member of {@link KEY_HISTORY_TRUNCATION_REASONS} that applies, in that order. Empty exactly when `truncated` is `false`. */
      readonly truncatedBy: readonly KeyHistoryTruncation[];
      /** How many examined commits held the locale file in a state that could not be read or whose value was too long. */
      readonly unreadableRevisions: number;
    };

/** Input for {@link keyHistory}. */
export interface KeyHistoryInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against and git runs in. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; pass `cwd` from {@link resolveProjectRoot} for a copied config. */
  readonly cwd?: string;
  /** A configured target locale. */
  readonly locale: string;
  /** The key, at most {@link KEY_HISTORY_MAX_KEY_CHARS} characters. It is compared with parsed keys and never passed to git. */
  readonly key: string;
  /**
   * The most commits to examine. Rounded down and clamped to between 1 and
   * {@link LOCALE_HISTORY_LIMIT_CAP}; defaults to {@link LOCALE_HISTORY_LIMIT_DEFAULT}.
   */
  readonly limit?: number;
}

/** Injectable dependencies for {@link keyHistory}. Every field has a working default. */
export interface KeyHistoryDeps {
  /** Runs `git`. Defaults to a real `child_process.execFile`. */
  readonly execFile?: GitExecFile;
}

type KeyState =
  | { readonly kind: "value"; readonly value: string }
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" };

const ABSENT: KeyState = { kind: "absent" };
const UNREADABLE: KeyState = { kind: "unreadable" };

interface ScopeFile {
  readonly absolutePath: string;
  readonly repoPath: string;
}

interface Scope {
  readonly config: VerbatraConfig;
  readonly locale: string;
  readonly key: string;
  readonly absolutePath: string;
  readonly files: readonly ScopeFile[];
  readonly lockPath: string;
  readonly provenancePath: string;
  readonly pathspecs: readonly string[];
  readonly expired: () => boolean;
  readonly limits: ByteLimits;
}

function assertUsableKey(key: string): void {
  if (typeof key !== "string" || key.length === 0 || key.length > KEY_HISTORY_MAX_KEY_CHARS) {
    throw new SdkError(
      "UNKNOWN_KEY",
      `The key must be a string of 1 to ${KEY_HISTORY_MAX_KEY_CHARS} characters.`,
    );
  }
}

type LocaleProbe =
  | { readonly kind: "settled"; readonly state: KeyState }
  | { readonly kind: "files"; readonly present: readonly ScopeFile[]; readonly bytes: number };

const SETTLED_UNREADABLE: LocaleProbe = { kind: "settled", state: UNREADABLE };
const SETTLED_ABSENT: LocaleProbe = { kind: "settled", state: ABSENT };

async function probeLocale(tree: GitWorkTree, commit: string, scope: Scope): Promise<LocaleProbe> {
  const stats: BlobStat[] = [];
  for (const file of scope.files) {
    stats.push(await statBlobAtCommit(tree, commit, file.repoPath));
  }
  if (stats.some((stat) => stat.kind === "failed" || stat.kind === "unreadable")) {
    return SETTLED_UNREADABLE;
  }
  const present = scope.files.filter((_, index) => stats[index]?.kind === "sized");
  if (present.length === 0) {
    return SETTLED_ABSENT;
  }
  let bytes = 0;
  for (const stat of stats) {
    bytes += stat.kind === "sized" ? stat.size : 0;
  }
  return { kind: "files", present, bytes };
}

function probeBytes(probe: LocaleProbe | undefined): number | null | undefined {
  if (probe === undefined) {
    return undefined;
  }
  return probe.kind === "files" ? probe.bytes : null;
}

async function readKeyState(
  tree: GitWorkTree,
  commit: string,
  scope: Scope,
  present: readonly ScopeFile[],
): Promise<KeyState | undefined> {
  const contents = new Map<string, string>();
  for (const file of present) {
    if (scope.expired()) {
      return undefined;
    }
    const blob = await readBlobBody(tree, commit, file.repoPath, scope.limits.fileCap);
    if (blob.kind === "failed" && blob.reason === "timeout" && scope.expired()) {
      return undefined;
    }
    if (blob.kind !== "ok") {
      return UNREADABLE;
    }
    contents.set(file.absolutePath, blob.content);
  }
  await pause();
  const siblings = new Map(contents);
  siblings.delete(scope.absolutePath);
  const parsed = await parseRevisionContent({
    format: scope.config.format,
    locale: scope.locale,
    absolutePath: scope.absolutePath,
    content: contents.get(scope.absolutePath) ?? "",
    siblings,
  });
  const entry = parsed?.entries.get(scope.key);
  if (
    parsed === undefined ||
    (entry !== undefined && entry.value.length > KEY_HISTORY_MAX_VALUE_CHARS)
  ) {
    return UNREADABLE;
  }
  return entry === undefined ? ABSENT : { kind: "value", value: entry.value };
}

type LogEntry =
  | {
      readonly malformed: false;
      readonly commit: { readonly hash: string; readonly authorDate: string };
      readonly rawAuthor: string;
      readonly rawSubject: string;
    }
  | { readonly malformed: true };

type ListedCommits =
  | { readonly ok: true; readonly commits: readonly LogEntry[] }
  | { readonly ok: false; readonly reason: LocaleGitUnavailableReason };

function parseLogEntries(stdout: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (line.includes(FIELD_SEPARATOR)) {
      const raw = parseRawCommitHeader(line);
      entries.push(
        raw === undefined
          ? { malformed: true }
          : {
              malformed: false,
              commit: { hash: raw.hash, authorDate: raw.authorDate },
              rawAuthor: raw.author,
              rawSubject: raw.subject,
            },
      );
    }
  }
  return entries;
}

async function listCommits(tree: GitWorkTree, scope: Scope, count: number): Promise<ListedCommits> {
  if (tree.head === undefined) {
    return { ok: true, commits: [] };
  }
  const result = await tree.runner.run(
    [
      "log",
      "--no-show-signature",
      "--first-parent",
      `--max-count=${count}`,
      `--format=${GIT_LOG_FORMAT}`,
      "--",
      ...scope.pathspecs,
    ],
    {
      config: ["-c", "log.follow=false", "-c", "i18n.logOutputEncoding=UTF-8"],
      timeout: LOCALE_HISTORY_TIMEOUT_MS,
      maxBuffer: LOCALE_HISTORY_MAX_OUTPUT_BYTES,
    },
  );
  return result.ok
    ? { ok: true, commits: parseLogEntries(result.stdout) }
    : unavailable(result.failure);
}

async function isShallow(tree: GitWorkTree): Promise<boolean> {
  const result = await tree.runner.run(["rev-parse", "--is-shallow-repository"]);
  return result.ok && result.stdout.trim() === "true";
}

async function runPool<T>(
  count: number,
  stop: () => boolean,
  work: (index: number) => Promise<T>,
): Promise<(T | undefined)[]> {
  const results: (T | undefined)[] = new Array(count).fill(undefined);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < count && !stop()) {
      const index = next;
      next += 1;
      results[index] = await work(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, count) }, worker));
  return results;
}

interface Changed {
  readonly index: number;
  readonly value: string;
  readonly previous: string | undefined;
}

function changedValues(
  states: readonly (KeyState | undefined)[],
  examined: number,
  listEndIsFileStart: boolean,
): Changed[] {
  const changes: Changed[] = [];
  for (let index = 0; index < examined; index += 1) {
    const state = states[index];
    if (state?.kind !== "value") {
      continue;
    }
    const atEnd = index + 1 >= states.length;
    const older = atEnd ? ABSENT : states[index + 1];
    if (older === undefined || older.kind === "unreadable" || (atEnd && !listEndIsFileStart)) {
      continue;
    }
    const previous = older.kind === "value" ? older.value : undefined;
    if (previous !== state.value) {
      changes.push({ index, value: state.value, previous });
    }
  }
  return changes;
}

type SourceHash =
  | { readonly kind: "read"; readonly hash: string | undefined }
  | { readonly kind: "skipped" };

const SOURCE_SKIPPED: SourceHash = { kind: "skipped" };

function boundedSourceFs(totalBytes: number): SdkFs {
  let remaining = totalBytes;
  return {
    ...defaultFs,
    async readFileBounded(path, maxBytes) {
      const outcome = await defaultFs.readFileBounded(path, Math.min(maxBytes, remaining));
      if (outcome.kind === "ok") {
        remaining -= Buffer.byteLength(outcome.content, "utf8");
      }
      return outcome;
    },
  };
}

async function currentSourceHash(scope: Scope, cwd: string): Promise<SourceHash> {
  if (scope.expired()) {
    return SOURCE_SKIPPED;
  }
  try {
    const fs = boundedSourceFs(scope.limits.fileCap);
    const source = await readSource(
      scope.config,
      cwd,
      fs,
      selectAdapter(scope.config.format, undefined, fs),
    );
    const entry = source.resource.entries.get(scope.key);
    return { kind: "read", hash: entry === undefined ? undefined : contentHash(entry) };
  } catch {
    return SOURCE_SKIPPED;
  }
}

type RecordFile =
  | { readonly kind: "content"; readonly content: string }
  | { readonly kind: "absent" }
  | { readonly kind: "skipped" };

const RECORD_ABSENT: RecordFile = { kind: "absent" };
const RECORD_SKIPPED: RecordFile = { kind: "skipped" };

type Parsed<T> = { readonly parsed: true; readonly value: T } | { readonly parsed: false };

function lockedHash(content: string, scope: Scope): Parsed<string | undefined> {
  try {
    const lock = parseLockFileRead({ kind: "ok", content }, scope.lockPath);
    return { parsed: true, value: ownValue(ownValue(lock.locales, scope.locale), scope.key) };
  } catch {
    return { parsed: false };
  }
}

function originOf(content: string, scope: Scope, value: string): Parsed<KeyOrigin | undefined> {
  try {
    const read = parseProvenanceRead({ kind: "ok", content }, scope.provenancePath);
    if (!read.writable) {
      return { parsed: false };
    }
    const record = ownValue(ownValue(read.file.locales, scope.locale), scope.key);
    return { parsed: true, value: keyProvenance(record, value).origin };
  } catch {
    return { parsed: false };
  }
}

interface RevisionContext {
  readonly origin: KeyOrigin | undefined;
  readonly sourceChanged: boolean | "unknown";
  readonly complete: boolean;
}

const NO_CONTEXT: RevisionContext = {
  origin: undefined,
  sourceChanged: "unknown",
  complete: false,
};

interface RecordProbe {
  readonly lock: BlobStat;
  readonly provenance: BlobStat;
}

async function probeRecords(tree: GitWorkTree, commit: string, scope: Scope): Promise<RecordProbe> {
  return {
    lock: await statBlobAtCommit(tree, commit, scope.lockPath),
    provenance: await statBlobAtCommit(tree, commit, scope.provenancePath),
  };
}

function recordSize(stat: BlobStat | undefined, present: boolean): number | null | undefined {
  if (!present) {
    return undefined;
  }
  return stat?.kind === "sized" ? stat.size : null;
}

async function readRecord(
  tree: GitWorkTree,
  commit: string,
  repoPath: string,
  stat: BlobStat,
  decision: ReadDecision,
  scope: Scope,
): Promise<RecordFile> {
  if (stat.kind === "absent") {
    return RECORD_ABSENT;
  }
  if (stat.kind !== "sized" || decision !== "read" || scope.expired()) {
    return RECORD_SKIPPED;
  }
  const blob = await readBlobBody(tree, commit, repoPath, RECORD_FILE_CAP);
  return blob.kind === "ok" ? { kind: "content", content: blob.content } : RECORD_SKIPPED;
}

interface RecordInput {
  readonly commit: string;
  readonly value: string;
  readonly probe: RecordProbe;
  readonly lockDecision: ReadDecision;
  readonly provenanceDecision: ReadDecision;
}

async function readContext(
  tree: GitWorkTree,
  scope: Scope,
  input: RecordInput,
  source: SourceHash,
): Promise<RevisionContext> {
  const lock = await readRecord(
    tree,
    input.commit,
    scope.lockPath,
    input.probe.lock,
    input.lockDecision,
    scope,
  );
  const provenance = await readRecord(
    tree,
    input.commit,
    scope.provenancePath,
    input.probe.provenance,
    input.provenanceDecision,
    scope,
  );
  await pause();
  const locked = lock.kind === "content" ? lockedHash(lock.content, scope) : undefined;
  await pause();
  const origin =
    provenance.kind === "content" ? originOf(provenance.content, scope, input.value) : undefined;
  const sourceHash = source.kind === "read" ? source.hash : undefined;
  const lockedValue = locked?.parsed === true ? locked.value : undefined;
  return {
    origin:
      origin?.parsed === true
        ? origin.value
        : provenance.kind === "absent"
          ? "unrecorded"
          : undefined,
    sourceChanged:
      lockedValue === undefined || sourceHash === undefined
        ? "unknown"
        : lockedValue !== sourceHash,
    complete:
      lock.kind !== "skipped" &&
      provenance.kind !== "skipped" &&
      locked?.parsed !== false &&
      origin?.parsed !== false,
  };
}

async function readContexts(
  tree: GitWorkTree,
  scope: Scope,
  inputs: readonly { readonly commit: string; readonly value: string }[],
  source: SourceHash,
): Promise<RevisionContext[]> {
  const probes = await runPool(inputs.length, scope.expired, (index) =>
    probeRecords(tree, (inputs[index] as { commit: string }).commit, scope),
  );
  const decisions = planReads(
    probes.flatMap((probe) => [
      recordSize(probe?.lock, probe !== undefined),
      recordSize(probe?.provenance, probe !== undefined),
    ]),
    RECORD_LIMITS,
  );
  const contexts = await runPool(inputs.length, scope.expired, (index) => {
    const input = inputs[index] as { commit: string; value: string };
    return readContext(
      tree,
      scope,
      {
        ...input,
        probe: probes[index] as RecordProbe,
        lockDecision: decisions[index * 2] as ReadDecision,
        provenanceDecision: decisions[index * 2 + 1] as ReadDecision,
      },
      source,
    );
  });
  return contexts.map((context) => context ?? NO_CONTEXT);
}

interface ScrubbedDiff {
  readonly value: string;
  readonly valueRedacted: boolean;
  readonly diff: KeyHistorySegment[];
}

function scrubbedDiff(
  scrubber: Scrubber,
  previous: string | undefined,
  value: string,
): ScrubbedDiff {
  const scrubbed = scrubber.scrub(value);
  return {
    value: scrubbed,
    valueRedacted: scrubbed !== value,
    diff: diffValues(scrubber.scrub(previous ?? ""), scrubbed),
  };
}

interface PendingRevision {
  readonly entry: Extract<LogEntry, { readonly malformed: false }>;
  readonly change: Changed;
  readonly context: RevisionContext;
}

function revisionOf(scrubber: Scrubber, pending: PendingRevision): KeyRevision {
  const { entry, change, context } = pending;
  const { value, valueRedacted, diff } = scrubbedDiff(scrubber, change.previous, change.value);
  return {
    commit: entry.commit.hash,
    authorDate: entry.commit.authorDate,
    author: clipText(scrubber.scrub(entry.rawAuthor), COMMIT_AUTHOR_MAX_CHARS),
    subject: clipText(scrubber.scrub(entry.rawSubject), COMMIT_SUBJECT_MAX_CHARS),
    value,
    ...(valueRedacted ? { valueRedacted: true as const } : {}),
    ...(context.origin !== undefined ? { origin: context.origin } : {}),
    sourceChanged: context.sourceChanged,
    diff,
  };
}

interface Collected {
  readonly pending: PendingRevision[];
  readonly truncatedBy: ReadonlySet<KeyHistoryTruncation>;
  readonly unreadableRevisions: number;
  readonly head: KeyState | undefined;
}

function hashOf(entry: LogEntry | undefined): string {
  return entry !== undefined && !entry.malformed ? entry.commit.hash : "";
}

interface Coverage {
  readonly moreCommits: boolean;
  readonly shallow: boolean;
  readonly deadline: boolean;
  readonly reads: ReadonlySet<KeyHistoryTruncation>;
  readonly contexts: readonly RevisionContext[];
  readonly source: SourceHash | undefined;
}

function truncationReasons(coverage: Coverage): Set<KeyHistoryTruncation> {
  const reasons = new Set(coverage.reads);
  if (coverage.moreCommits) {
    reasons.add("commit-limit");
  }
  if (coverage.shallow) {
    reasons.add("shallow-clone");
  }
  if (coverage.deadline) {
    reasons.add("deadline");
  }
  if (coverage.source?.kind === "skipped") {
    reasons.add("source-unreadable");
  }
  if (coverage.contexts.some((context) => !context.complete)) {
    reasons.add("records-unreadable");
  }
  return reasons;
}

async function readStates(
  tree: GitWorkTree,
  scope: Scope,
  commits: readonly LogEntry[],
): Promise<{
  readonly states: (KeyState | undefined)[];
  readonly reads: Set<KeyHistoryTruncation>;
}> {
  const probes = await runPool(commits.length, scope.expired, (index) => {
    const hash = hashOf(commits[index]);
    return hash === "" ? Promise.resolve(SETTLED_UNREADABLE) : probeLocale(tree, hash, scope);
  });
  const sizes = probes.map(probeBytes);
  const decisions = planReads(sizes, scope.limits);
  const states = await runPool(commits.length, scope.expired, async (index) => {
    const probe = probes[index];
    switch (decisions[index]) {
      case "nothing":
        return (probe as Extract<LocaleProbe, { kind: "settled" }>).state;
      case "over-cap":
        return UNREADABLE;
      case "read":
        return readKeyState(
          tree,
          hashOf(commits[index]),
          scope,
          (probe as Extract<LocaleProbe, { kind: "files" }>).present,
        );
      default:
        return undefined;
    }
  });
  return { states, reads: readReasons(states, decisions, sizes) };
}

function readReasons(
  states: readonly (KeyState | undefined)[],
  decisions: readonly ReadDecision[],
  sizes: readonly (number | null | undefined)[],
): Set<KeyHistoryTruncation> {
  const reasons = new Set<KeyHistoryTruncation>();
  let cutBy: KeyHistoryTruncation | undefined;
  states.forEach((state, index) => {
    const decision = decisions[index];
    if (decision === "over-cap") {
      reasons.add("file-too-large");
    } else if (decision === "cut") {
      cutBy ??= sizes[index] === undefined ? "deadline" : "byte-budget";
      reasons.add(cutBy);
    } else if (state === undefined) {
      reasons.add("deadline");
    } else if (state.kind === "unreadable") {
      reasons.add("unreadable-revision");
    }
  });
  return reasons;
}

async function collectRevisions(
  tree: GitWorkTree,
  scope: Scope,
  cwd: string,
  limit: number,
): Promise<Collected | { readonly reason: LocaleGitUnavailableReason }> {
  const listed = await listCommits(tree, scope, limit + 1);
  if (!listed.ok) {
    return { reason: listed.reason };
  }
  const commits = listed.commits;
  const { states, reads } = await readStates(tree, scope, commits);
  const examined = Math.min(limit, commits.length);
  const moreCommits = commits.length > limit;
  const atListEnd = commits.length > 0 && !moreCommits;
  const stopped = atListEnd && scope.expired();
  const shallow = atListEnd && !stopped && (await isShallow(tree));
  const changes = changedValues(states, examined, !(shallow || stopped));
  const source = changes.length > 0 ? await currentSourceHash(scope, cwd) : undefined;
  const contexts =
    source === undefined
      ? []
      : await readContexts(
          tree,
          scope,
          changes.map((change) => ({ commit: hashOf(commits[change.index]), value: change.value })),
          source,
        );
  return {
    pending: changes.map((change, index) => ({
      entry: commits[change.index] as Extract<LogEntry, { readonly malformed: false }>,
      change,
      context: contexts[index] as RevisionContext,
    })),
    truncatedBy: truncationReasons({
      moreCommits,
      shallow,
      deadline: stopped,
      reads,
      contexts,
      source,
    }),
    unreadableRevisions: states.slice(0, examined).filter((state) => state?.kind === "unreadable")
      .length,
    head: commits.length === 0 ? ABSENT : states[0],
  };
}

interface RawWorkingTree {
  readonly value: string;
  readonly previous: string | undefined;
}

function workingTreeValue(
  scope: Scope,
  working: Extract<Side, { readonly ok: true }>,
  head: KeyState | undefined,
): RawWorkingTree | "unreadable" | undefined {
  const value = working.entries.get(scope.key)?.value;
  if (value === undefined) {
    return undefined;
  }
  if (value.length > KEY_HISTORY_MAX_VALUE_CHARS || scope.expired()) {
    return "unreadable";
  }
  if (head === undefined || head.kind === "unreadable") {
    return "unreadable";
  }
  const previous = head.kind === "value" ? head.value : undefined;
  return previous === value ? undefined : { value, previous };
}

function* scrubSources(
  pending: readonly PendingRevision[],
  workingTree: RawWorkingTree | undefined,
): Generator<string> {
  for (const { entry, change } of pending) {
    yield change.value;
    yield change.previous ?? "";
    yield entry.rawSubject;
    yield entry.rawAuthor;
  }
  if (workingTree !== undefined) {
    yield workingTree.value;
    yield workingTree.previous ?? "";
  }
}

function latchedDeadline(deadline: number): () => boolean {
  let passed = false;
  return () => {
    passed = passed || Date.now() >= deadline;
    return passed;
  };
}

function buildScope(
  input: KeyHistoryInput,
  tree: GitWorkTree,
  paths: { readonly main: string; readonly siblings: readonly string[] },
  cwd: string,
  absolutePath: string,
  deadline: number,
  limits: ByteLimits,
): Scope {
  const files = [paths.main, ...paths.siblings].map((path) => ({
    absolutePath: resolvePath(cwd, path),
    repoPath: tree.prefix + path,
  }));
  return {
    config: input.config,
    locale: input.locale,
    key: input.key,
    absolutePath,
    files,
    lockPath: `${tree.prefix}verbatra.lock.json`,
    provenancePath: `${tree.prefix}verbatra.provenance.json`,
    pathspecs: [paths.main, ...paths.siblings],
    expired: latchedDeadline(deadline),
    limits,
  };
}

/**
 * Lists the git commits in which one key's value changed in one target locale, newest first, each
 * with its author, date, subject, the value, where the value came from and a word-level
 * difference from the key's previous value. When the value on disk differs from the one at `HEAD`
 * it is returned as `workingTree`. It writes nothing and calls no provider.
 *
 * The locale file's commits come from `git log --first-parent` on that file alone (and its
 * `.stringsdict` file for `apple-strings`), so a change brought in by a merge appears on the merge
 * commit. Each commit's file is read with `git cat-file blob` over the safeguards of
 * {@link localeGitDiff}, parsed by the built-in adapter over an in-memory file system, and a
 * commit is listed only when the key's value differs from the value in the commit right before it
 * in the file's history, which must have been read. A commit that removes the key is not listed.
 * A value is compared exactly, so a change of whitespace alone is a revision. `origin` comes
 * from the provenance file and `sourceChanged` from the lock-file as committed with the
 * revision. At most {@link LOCALE_HISTORY_LIMIT_CAP} commits are examined,
 * {@link LOCALE_HISTORY_LIMIT_DEFAULT} by default, four files are read at a time, and after
 * {@link KEY_HISTORY_DEADLINE_MS} no further commit is examined and no commit file read starts (the file on disk is still read); the
 * `git log` call, a size listing and a read already running keep their own 10 second limit. A revision whose records were not read has no `origin` and `sourceChanged`
 * `"unknown"`.
 *
 * `truncated` is `true` whenever anything the call examined was skipped, unreadable, above a size
 * limit, past a budget or stopped by the deadline: older commits exist that were not examined, the
 * repository is a shallow clone, a commit could not be read or parsed, held a value that is too
 * long or had a log line that did not parse, the lock file, the provenance file or the source file
 * could not be read, parsed or was above its size limit, or the deadline passed. A commit is
 * listed as a change only when the commit before it was read, so a commit whose older neighbour
 * could not be read is not claimed as the key's change; `truncated` says so.
 *
 * What is read is bounded by sizes git reports before anything is parsed, so the same repository
 * gets the same byte-limit and budget decisions on every machine; a git call that times out, the
 * deadline and the provider keys in the environment (which decide what {@link redact} changes)
 * can still change an answer. A locale file above 512 KiB for `yaml` and the XML
 * formats (`xliff`, `android-xml`, `resx`, `apple-strings`) or above 4 MiB for the other formats
 * is skipped without being parsed, and the two files of an `apple-strings` commit count as their
 * sum. In one call the locale files read add up to at most 16 MiB for those formats and 128 MiB
 * for the others: past that, older commits are not examined. A lock file or provenance file above
 * 4 MiB is not read, and together they add up to at most 128 MiB per call: past that, older
 * revisions have no `origin` and `sourceChanged` is `"unknown"`. The source file follows the cap
 * of the locale files, and `sourceChanged` is `"unknown"` when it is above it. A commit skipped
 * for its size, or that cannot be read or parsed, counts in `unreadableRevisions`; a commit past
 * the budget is not examined and does not. Parsing yields to the event loop between files. The
 * file on disk follows the same cap; when it cannot be compared with `HEAD` the answer still lists
 * the revisions, has no `workingTree` and sets `workingTreeUnreadable`. That also happens when
 * `HEAD`'s own copy could not be read or the time ran out.
 *
 * Every value and both sides of every difference pass {@link redact}: a value that changes is
 * returned with `[REDACTED]` for the key and flagged `valueRedacted`, and must not be offered
 * for restore.
 *
 * Limits: renames are not followed, so history before a locale file was renamed is not listed;
 * edits that were never committed, other than the one on disk, are not seen; a key renamed in
 * the source looks like a new key. A file shared by locales, as in `apple-xcstrings`, is read for
 * the requested locale only. A `custom:` format answers `custom-adapter`. Author names and
 * subjects lose control and bidirectional formatting characters.
 *
 * @param input - The config, the locale, the key, the project directory and the commit limit.
 * @param deps - Optional process runner override.
 * @returns The revisions, or `available: false` with a {@link LocaleGitUnavailableReason}.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the locale is not a configured target locale.
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is empty or longer than {@link KEY_HISTORY_MAX_KEY_CHARS}.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 *
 * @example
 * ```ts
 * import { keyHistory, loadConfig } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const history = await keyHistory({ config, locale: "de", key: "cart.title" });
 * if (history.available) {
 *   for (const revision of history.revisions) {
 *     console.log(revision.authorDate, revision.author, revision.value);
 *   }
 * }
 * ```
 */
export async function keyHistory(
  input: KeyHistoryInput,
  deps: KeyHistoryDeps = {},
): Promise<KeyHistoryResult> {
  const deadline = Date.now() + KEY_HISTORY_DEADLINE_MS;
  assertUsableKey(input.key);
  assertTargetLocale(input.config, input.locale);
  const cwd = resolvePath(projectCwd(input));
  const absolutePath = createLocalePathResolver(cwd, input.config).pathFor(input.locale);
  const format = input.config.format;
  if (isCustomFormatId(format)) {
    return { available: false, reason: "custom-adapter" };
  }
  if (localeLeavesProject(cwd, input.config, [input.locale])) {
    return { available: false, reason: "outside-project" };
  }
  const watched = watchedFiles(cwd, input.config);
  const file = watched.find(
    (candidate) => candidate.siblingOf === undefined && candidate.locales.includes(input.locale),
  );
  if (file === undefined) {
    return { available: false, reason: "working-file-unreadable" };
  }
  const siblings = watched.filter((candidate) => candidate.siblingOf === file.path);
  const limits = localeLimits(format);
  const opened = await openGitWorkTree(deps.execFile ?? defaultGitExecFile, cwd);
  if (!opened.ok) {
    return { available: false, reason: opened.reason };
  }
  const scope = buildScope(
    input,
    opened.tree,
    { main: file.path, siblings: siblings.map((sibling) => sibling.path) },
    cwd,
    absolutePath,
    deadline,
    limits,
  );
  const sideInput: SideInput = {
    config: input.config,
    locale: input.locale,
    root: cwd,
    absolutePath,
    siblingPaths: scope.files.slice(1).map((sibling) => sibling.absolutePath),
    maxBytes: limits.fileCap,
    sharedBytes: true,
  };
  const working = await readWorkingSide(sideInput);
  const collected = await collectRevisions(opened.tree, scope, cwd, clampHistoryLimit(input.limit));
  if ("reason" in collected) {
    return { available: false, reason: collected.reason };
  }
  const rawWorking = working.ok ? workingTreeValue(scope, working, collected.head) : "unreadable";
  const rawTree = typeof rawWorking === "object" ? rawWorking : undefined;
  const scrubber = makeScrubber(scrubSources(collected.pending, rawTree));
  const workingTree =
    rawTree === undefined
      ? undefined
      : (({ value, valueRedacted, diff }): KeyWorkingTreeValue => ({
          value,
          ...(valueRedacted ? { valueRedacted: true as const } : {}),
          diff,
        }))(scrubbedDiff(scrubber, rawTree.previous, rawTree.value));
  const reasons = new Set(collected.truncatedBy);
  if (scrubber.overflowed) {
    reasons.add("scrub-cap");
  }
  const truncatedBy = KEY_HISTORY_TRUNCATION_REASONS.filter((reason) => reasons.has(reason));
  return {
    available: true,
    revisions: collected.pending.map((pending) => revisionOf(scrubber, pending)),
    ...(workingTree !== undefined ? { workingTree } : {}),
    ...(rawWorking === "unreadable" ? { workingTreeUnreadable: true as const } : {}),
    truncated: truncatedBy.length > 0,
    truncatedBy,
    unreadableRevisions: collected.unreadableRevisions,
  };
}

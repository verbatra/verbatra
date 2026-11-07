import { resolve as resolvePath } from "node:path";
import { contentHash, isCustomFormatId } from "@verbatra/core";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { type KeyOrigin, keyProvenance } from "../lock/key-provenance.js";
import { parseLockFileRead } from "../lock/lock-file.js";
import { parseProvenanceRead } from "../lock/provenance-file.js";
import { ownValue } from "../record-utils.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readWorkingSide, type Side, type SideInput } from "./git-diff.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import {
  clampHistoryLimit,
  LOCALE_HISTORY_MAX_OUTPUT_BYTES,
  LOCALE_HISTORY_TIMEOUT_MS,
  type LocaleHistoryCommit,
  parseGitLogOutput,
} from "./git-log.js";
import { type BlobRead, parseRevisionContent, readBlobAtCommit } from "./git-revision.js";
import { localeLeavesProject, watchedFiles } from "./git-status.js";
import {
  type GitWorkTree,
  type LocaleGitUnavailableReason,
  openGitWorkTree,
  unavailable,
} from "./git-worktree.js";
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
const MAX_AUTHOR_CHARS = 200;
const MAX_SUBJECT_CHARS = 500;
const LOG_FORMAT = "%H%x00%aI%x00%aN%x00%s";

/**
 * One commit in which a key's value changed, as {@link keyHistory} lists it.
 */
export interface KeyRevision {
  /** The full commit hash. */
  readonly commit: string;
  /** The author date in strict ISO 8601. */
  readonly authorDate: string;
  /** The author's name after `.mailmap`, never the email address, cut to 200 characters. */
  readonly author: string;
  /** The first line of the commit message, cut to 500 characters. */
  readonly subject: string;
  /** The key's value in that commit. Untrusted: show it as text. */
  readonly value: string;
  /**
   * Which write path produced the value, read from `verbatra.provenance.json` as committed with it:
   * a stored origin, `unrecorded` when that file holds no record for the key, or `external` when
   * its record describes a different value. Absent when that file could not be read, or when the
   * time ran out before it was.
   */
  readonly origin?: KeyOrigin;
  /**
   * Whether the key's source text differs now from the one the lock-file recorded in that commit.
   * `unknown` when the lock-file, its entry for the key or the key's current source is not
   * available, or the time ran out before the lock-file was read. Restoring a revision whose source changed makes it count as up to date.
   */
  readonly sourceChanged: boolean | "unknown";
  /** The word-level difference from the previous value of the key; the whole value when the key first appears. */
  readonly diff: readonly KeyHistorySegment[];
}

/** A value in the working tree that is not committed yet. */
export interface KeyWorkingTreeValue {
  /** The key's value on disk. Untrusted: show it as text. */
  readonly value: string;
  /** The word-level difference from the value at `HEAD`; the whole value when `HEAD` has none. */
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
      /** `true` when older history exists that this answer does not cover. */
      readonly truncated: boolean;
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
}

function assertUsableKey(key: string): void {
  if (typeof key !== "string" || key.length === 0 || key.length > KEY_HISTORY_MAX_KEY_CHARS) {
    throw new SdkError(
      "UNKNOWN_KEY",
      `The key must be a string of 1 to ${KEY_HISTORY_MAX_KEY_CHARS} characters.`,
    );
  }
}

function clipText(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const lastUnit = text.charCodeAt(max - 1);
  return text.slice(0, lastUnit >= 0xd800 && lastUnit <= 0xdbff ? max - 1 : max);
}

async function readKeyState(tree: GitWorkTree, commit: string, scope: Scope): Promise<KeyState> {
  const blobs: BlobRead[] = [];
  for (const file of scope.files) {
    blobs.push(await readBlobAtCommit(tree, commit, file.repoPath));
  }
  if (blobs.some((blob) => blob.kind === "failed" || blob.kind === "unreadable")) {
    return UNREADABLE;
  }
  const contents = new Map<string, string>();
  scope.files.forEach((file, index) => {
    const blob = blobs[index];
    if (blob?.kind === "ok") {
      contents.set(file.absolutePath, blob.content);
    }
  });
  if (contents.size === 0) {
    return ABSENT;
  }
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

type ListedCommits =
  | { readonly ok: true; readonly commits: readonly LocaleHistoryCommit[] }
  | { readonly ok: false; readonly reason: LocaleGitUnavailableReason };

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
      `--format=${LOG_FORMAT}`,
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
    ? { ok: true, commits: parseGitLogOutput(result.stdout) }
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

function olderReadable(
  states: readonly (KeyState | undefined)[],
  from: number,
): KeyState | undefined {
  return states.slice(from).find((state) => state !== undefined && state.kind !== "unreadable");
}

interface Changed {
  readonly index: number;
  readonly value: string;
  readonly previous: string | undefined;
}

function changedValues(
  states: readonly (KeyState | undefined)[],
  examined: number,
  cut: boolean,
): Changed[] {
  const changed: Changed[] = [];
  for (let index = 0; index < examined; index += 1) {
    const state = states[index];
    if (state?.kind !== "value") {
      continue;
    }
    const older = olderReadable(states, index + 1);
    if (older === undefined && cut) {
      continue;
    }
    const previous = older?.kind === "value" ? older.value : undefined;
    if (previous !== state.value) {
      changed.push({ index, value: state.value, previous });
    }
  }
  return changed;
}

async function currentSourceHash(
  config: VerbatraConfig,
  cwd: string,
  key: string,
): Promise<string | undefined> {
  try {
    const source = await readSource(config, cwd, defaultFs, selectAdapter(config.format));
    const entry = source.resource.entries.get(key);
    return entry === undefined ? undefined : contentHash(entry);
  } catch {
    return undefined;
  }
}

function lockedHash(content: string, scope: Scope): string | undefined {
  try {
    const lock = parseLockFileRead({ kind: "ok", content }, scope.lockPath);
    return ownValue(ownValue(lock.locales, scope.locale), scope.key);
  } catch {
    return undefined;
  }
}

function originOf(content: string, scope: Scope, value: string): KeyOrigin | undefined {
  try {
    const read = parseProvenanceRead({ kind: "ok", content }, scope.provenancePath);
    if (!read.writable) {
      return undefined;
    }
    const record = ownValue(ownValue(read.file.locales, scope.locale), scope.key);
    return keyProvenance(record, value).origin;
  } catch {
    return undefined;
  }
}

interface RevisionContext {
  readonly origin: KeyOrigin | undefined;
  readonly sourceChanged: boolean | "unknown";
}

const NO_CONTEXT: RevisionContext = { origin: undefined, sourceChanged: "unknown" };

async function readContext(
  tree: GitWorkTree,
  commit: string,
  scope: Scope,
  value: string,
  sourceHash: string | undefined,
): Promise<RevisionContext> {
  const lock = await readBlobAtCommit(tree, commit, scope.lockPath);
  const provenance = await readBlobAtCommit(tree, commit, scope.provenancePath);
  const locked = lock.kind === "ok" ? lockedHash(lock.content, scope) : undefined;
  const origin =
    provenance.kind === "ok"
      ? originOf(provenance.content, scope, value)
      : provenance.kind === "absent"
        ? "unrecorded"
        : undefined;
  return {
    origin,
    sourceChanged:
      locked === undefined || sourceHash === undefined ? "unknown" : locked !== sourceHash,
  };
}

function revisionOf(
  commit: LocaleHistoryCommit,
  change: Changed,
  context: RevisionContext,
): KeyRevision {
  return {
    commit: commit.hash,
    authorDate: commit.authorDate,
    author: clipText(commit.author, MAX_AUTHOR_CHARS),
    subject: clipText(commit.subject, MAX_SUBJECT_CHARS),
    value: change.value,
    ...(context.origin !== undefined ? { origin: context.origin } : {}),
    sourceChanged: context.sourceChanged,
    diff: diffValues(change.previous ?? "", change.value),
  };
}

interface Collected {
  readonly revisions: KeyRevision[];
  readonly truncated: boolean;
  readonly unreadableRevisions: number;
}

async function collectRevisions(
  tree: GitWorkTree,
  scope: Scope,
  cwd: string,
  limit: number,
  deadline: number,
): Promise<Collected | { readonly reason: LocaleGitUnavailableReason }> {
  const listed = await listCommits(tree, scope, limit + 1);
  if (!listed.ok) {
    return { reason: listed.reason };
  }
  const commits = listed.commits;
  const expired = (): boolean => Date.now() >= deadline;
  const states = await runPool(commits.length, expired, (index) =>
    readKeyState(tree, (commits[index] as LocaleHistoryCommit).hash, scope),
  );
  const examined = Math.min(limit, commits.length);
  const unread = states.some((state) => state === undefined);
  const cut = commits.length > limit || unread || (commits.length > 0 && (await isShallow(tree)));
  const changes = changedValues(states, examined, cut);
  const sourceHash =
    changes.length > 0 ? await currentSourceHash(scope.config, cwd, scope.key) : undefined;
  const contexts = await runPool(changes.length, expired, (index) => {
    const change = changes[index] as Changed;
    return readContext(
      tree,
      (commits[change.index] as LocaleHistoryCommit).hash,
      scope,
      change.value,
      sourceHash,
    );
  });
  return {
    revisions: changes.map((change, index) =>
      revisionOf(
        commits[change.index] as LocaleHistoryCommit,
        change,
        contexts[index] ?? NO_CONTEXT,
      ),
    ),
    truncated: cut,
    unreadableRevisions: states.slice(0, examined).filter((state) => state?.kind === "unreadable")
      .length,
  };
}

async function workingTreeValue(
  tree: GitWorkTree,
  scope: Scope,
  working: Extract<Side, { readonly ok: true }>,
): Promise<KeyWorkingTreeValue | undefined> {
  const value = working.entries.get(scope.key)?.value;
  if (value === undefined || value.length > KEY_HISTORY_MAX_VALUE_CHARS) {
    return undefined;
  }
  const head = tree.head === undefined ? ABSENT : await readKeyState(tree, tree.head, scope);
  if (head.kind === "unreadable") {
    return undefined;
  }
  const previous = head.kind === "value" ? head.value : undefined;
  return previous === value ? undefined : { value, diff: diffValues(previous ?? "", value) };
}

function buildScope(
  input: KeyHistoryInput,
  tree: GitWorkTree,
  paths: { readonly main: string; readonly siblings: readonly string[] },
  cwd: string,
  absolutePath: string,
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
 * commit is listed only when the key's value differs from the value in the next older readable
 * commit. A commit that removes the key is not listed. A value is compared exactly, so a change
 * of whitespace alone is a revision. `origin` comes from the provenance file and `sourceChanged`
 * from the lock-file as committed with the revision. At most {@link LOCALE_HISTORY_LIMIT_CAP}
 * commits are examined, {@link LOCALE_HISTORY_LIMIT_DEFAULT} by default, four files are read at a
 * time, and no new read starts after {@link KEY_HISTORY_DEADLINE_MS}; a read already running ends
 * within its own 10 second limit. `truncated` is `true` when older commits exist that were not
 * examined, the repository is a shallow clone, or the deadline passed before every examined
 * commit was read. A revision whose records were not read in time has no `origin` and
 * `sourceChanged` `"unknown"`, and `truncated` does not say so. A commit whose file could not be read or parsed, or whose value is longer than
 * {@link KEY_HISTORY_MAX_VALUE_CHARS} characters, counts in `unreadableRevisions` and is skipped.
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
  if (isCustomFormatId(input.config.format)) {
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
  );
  const sideInput: SideInput = {
    config: input.config,
    locale: input.locale,
    root: cwd,
    absolutePath,
    siblingPaths: scope.files.slice(1).map((sibling) => sibling.absolutePath),
  };
  const working = await readWorkingSide(sideInput);
  if (!working.ok) {
    return { available: false, reason: working.reason };
  }
  const collected = await collectRevisions(
    opened.tree,
    scope,
    cwd,
    clampHistoryLimit(input.limit),
    deadline,
  );
  if ("reason" in collected) {
    return { available: false, reason: collected.reason };
  }
  const workingTree = await workingTreeValue(opened.tree, scope, working);
  return {
    available: true,
    revisions: collected.revisions,
    ...(workingTree !== undefined ? { workingTree } : {}),
    truncated: collected.truncated,
    unreadableRevisions: collected.unreadableRevisions,
  };
}

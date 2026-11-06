import { basename, dirname, relative, resolve as resolvePath } from "node:path";
import { isCustomFormatId } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import { LOCALE_GIT_BLOB_MAX_BYTES, parseRevisionContent, readBlobAtHead } from "./git-revision.js";
import { type LocaleGitFileState, queryFileStates, watchedFiles } from "./git-status.js";
import {
  type GitWorkTree,
  type LocaleGitUnavailableReason,
  openGitWorkTree,
} from "./git-worktree.js";
import { assertTargetLocale } from "./select-locales.js";

/** How git sees the file: a {@link LocaleGitFileState}, or `unchanged` when it matches `HEAD`. */
export type LocaleGitDiffState = LocaleGitFileState | "unchanged";

/** A key present on only one side of a {@link localeGitDiff}, with its text. */
export interface LocaleGitDiffEntry {
  /** The key. */
  readonly key: string;
  /** The key's text, cut to {@link LOCALE_GIT_DIFF_MAX_VALUE_CHARS} characters. */
  readonly value: string;
}

/** A key present on both sides of a {@link localeGitDiff} whose text differs. */
export interface LocaleGitDiffChange {
  /** The key. */
  readonly key: string;
  /** The text at `HEAD`, cut to {@link LOCALE_GIT_DIFF_MAX_VALUE_CHARS} characters. */
  readonly before: string;
  /** The text in the working tree, cut to {@link LOCALE_GIT_DIFF_MAX_VALUE_CHARS} characters. */
  readonly after: string;
}

/**
 * The result of {@link localeGitDiff}: `available: false` with a reason when the comparison could
 * not be made, otherwise the key-level difference between `HEAD` and the working tree.
 */
export type LocaleGitDiffResult =
  | {
      /** `false`: the comparison could not be made. */
      readonly available: false;
      /** Why the comparison could not be made. */
      readonly reason: LocaleGitUnavailableReason;
    }
  | {
      /** `true`: the comparison was made. */
      readonly available: true;
      /** The locale's file path relative to the project directory, with `/` separators. */
      readonly path: string;
      /** How git sees the file. A `conflicted` file carries no difference, and neither does an `unchanged` one. */
      readonly state: LocaleGitDiffState;
      /** Keys in the working tree and not at `HEAD`, in working-tree order. */
      readonly added: readonly LocaleGitDiffEntry[];
      /** Keys at `HEAD` and not in the working tree, in `HEAD` order. */
      readonly removed: readonly LocaleGitDiffEntry[];
      /** Keys on both sides with different text, in working-tree order. */
      readonly changed: readonly LocaleGitDiffChange[];
      /** `true` when more than {@link LOCALE_GIT_DIFF_MAX_ENTRIES} keys differ or a text was cut, so the lists are incomplete. */
      readonly truncated: boolean;
    };

/** Input for {@link localeGitDiff}. */
export interface LocaleGitDiffInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** The source locale or a configured target locale to compare. */
  readonly locale: string;
  /** Directory the `files.pattern` is resolved against and git runs in. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; pass `cwd` from {@link resolveProjectRoot} for a copied config. */
  readonly cwd?: string;
}

/**
 * Injectable dependencies for {@link localeGitDiff}. Passing an `adapterRegistry` makes the call
 * return `custom-adapter`: the committed file is parsed by the built-in adapters over a private
 * in-memory file system, which a registry of your own cannot be given.
 */
export interface LocaleGitDiffDeps {
  /** Runs `git`. Defaults to a real `child_process.execFile`. */
  readonly execFile?: GitExecFile;
  /** Present only to be refused: any value makes the result `custom-adapter`. */
  readonly adapterRegistry?: AdapterRegistry;
}

/** The most differing keys {@link localeGitDiff} lists in total; the rest set `truncated`. */
export const LOCALE_GIT_DIFF_MAX_ENTRIES = 500;
/** The longest text {@link localeGitDiff} returns for one value, in characters; a longer one is cut and sets `truncated`. */
export const LOCALE_GIT_DIFF_MAX_VALUE_CHARS = 2000;

interface DiffBody {
  readonly added: LocaleGitDiffEntry[];
  readonly removed: LocaleGitDiffEntry[];
  readonly changed: LocaleGitDiffChange[];
  readonly truncated: boolean;
}

const EMPTY_BODY: DiffBody = { added: [], removed: [], changed: [], truncated: false };

function clip(value: string): { readonly text: string; readonly cut: boolean } {
  if (value.length <= LOCALE_GIT_DIFF_MAX_VALUE_CHARS) {
    return { text: value, cut: false };
  }
  const end = LOCALE_GIT_DIFF_MAX_VALUE_CHARS;
  const lastUnit = value.charCodeAt(end - 1);
  const splitsPair = lastUnit >= 0xd800 && lastUnit <= 0xdbff;
  return { text: value.slice(0, splitsPair ? end - 1 : end), cut: true };
}

class DiffCollector {
  readonly added: LocaleGitDiffEntry[] = [];
  readonly removed: LocaleGitDiffEntry[] = [];
  readonly changed: LocaleGitDiffChange[] = [];
  truncated = false;
  private count = 0;

  take(): boolean {
    if (this.count >= LOCALE_GIT_DIFF_MAX_ENTRIES) {
      this.truncated = true;
      return false;
    }
    this.count += 1;
    return true;
  }

  text(value: string): string {
    const clipped = clip(value);
    this.truncated = this.truncated || clipped.cut;
    return clipped.text;
  }
}

export function compareResources(
  before: ReadonlyMap<string, { readonly value: string }>,
  after: ReadonlyMap<string, { readonly value: string }>,
): DiffBody {
  const collector = new DiffCollector();
  for (const [key, entry] of after) {
    const previous = before.get(key);
    if (previous === undefined) {
      if (collector.take()) {
        collector.added.push({ key: collector.text(key), value: collector.text(entry.value) });
      }
    } else if (previous.value !== entry.value && collector.take()) {
      collector.changed.push({
        key: collector.text(key),
        before: collector.text(previous.value),
        after: collector.text(entry.value),
      });
    }
  }
  for (const [key, entry] of before) {
    if (!after.has(key) && collector.take()) {
      collector.removed.push({ key: collector.text(key), value: collector.text(entry.value) });
    }
  }
  return {
    added: collector.added,
    removed: collector.removed,
    changed: collector.changed,
    truncated: collector.truncated,
  };
}

type Side =
  | { readonly ok: true; readonly entries: ReadonlyMap<string, { readonly value: string }> }
  | { readonly ok: false; readonly reason: LocaleGitUnavailableReason };

const NOTHING: Side = { ok: true, entries: new Map() };

interface SideInput {
  readonly config: VerbatraConfig;
  readonly locale: string;
  readonly root: string;
  readonly absolutePath: string;
  readonly siblingPaths: readonly string[];
}

interface HeadFile {
  readonly absolutePath: string;
  readonly repoPath: string;
}

async function readHeadSide(
  tree: GitWorkTree,
  input: SideInput,
  files: readonly HeadFile[],
): Promise<Side> {
  const blobs = await Promise.all(files.map((file) => readBlobAtHead(tree, file.repoPath)));
  const failed = blobs.find((blob) => blob.kind === "failed");
  if (failed?.kind === "failed") {
    return { ok: false, reason: failed.reason };
  }
  if (blobs.some((blob) => blob.kind === "unreadable")) {
    return { ok: false, reason: "revision-unreadable" };
  }
  const contents = new Map<string, string>();
  files.forEach((file, index) => {
    const blob = blobs[index];
    if (blob?.kind === "ok") {
      contents.set(file.absolutePath, blob.content);
    }
  });
  if (contents.size === 0) {
    return NOTHING;
  }
  const siblings = new Map(contents);
  siblings.delete(input.absolutePath);
  const parsed = await parseRevisionContent({
    format: input.config.format,
    locale: input.locale,
    absolutePath: input.absolutePath,
    content: contents.get(input.absolutePath) ?? "",
    siblings,
  });
  return parsed === undefined
    ? { ok: false, reason: "revision-unreadable" }
    : { ok: true, entries: parsed.entries };
}

type FileKind = "file" | "missing" | "other";

export async function fileKind(path: string): Promise<FileKind> {
  try {
    const name = basename(path);
    const siblings = (await defaultFs.readDirectory?.(dirname(path))) ?? [];
    const exact = siblings.find((entry) => entry.name === name);
    const folded = siblings.filter((entry) => entry.name.toLowerCase() === name.toLowerCase());
    const found = exact ?? (folded.length === 1 ? folded[0] : undefined);
    if (found === undefined) {
      return "missing";
    }
    return found.kind === "file" ? "file" : "other";
  } catch {
    return "missing";
  }
}

function realPath(path: string): Promise<string> {
  return (defaultFs.realpath as (path: string) => Promise<string>)(path);
}

export async function workingFileKind(root: string, path: string): Promise<FileKind> {
  try {
    const realRoot = await realPath(root);
    const realDirectory = await realPath(dirname(path));
    const expected = resolvePath(realRoot, relative(root, dirname(path)));
    if (realDirectory.toLowerCase() !== expected.toLowerCase()) {
      return "other";
    }
  } catch {
    return "missing";
  }
  return fileKind(path);
}

export async function readWorkingContent(path: string): Promise<string | undefined> {
  const read = await defaultFs.readFileBounded(path, LOCALE_GIT_BLOB_MAX_BYTES);
  return read.kind === "ok" ? read.content : undefined;
}

async function readWorkingSide(input: SideInput): Promise<Side> {
  const paths = [input.absolutePath, ...input.siblingPaths];
  const kinds = await Promise.all(paths.map((path) => workingFileKind(input.root, path)));
  if (kinds.includes("other")) {
    return { ok: false, reason: "working-file-unreadable" };
  }
  const contents = new Map<string, string>();
  for (const [index, path] of paths.entries()) {
    if (kinds[index] === "file") {
      const content = await readWorkingContent(path);
      if (content === undefined) {
        return { ok: false, reason: "working-file-unreadable" };
      }
      contents.set(path, content);
    }
  }
  if (contents.size === 0) {
    return NOTHING;
  }
  const siblings = new Map(contents);
  siblings.delete(input.absolutePath);
  const parsed = await parseRevisionContent({
    format: input.config.format,
    locale: input.locale,
    absolutePath: input.absolutePath,
    content: contents.get(input.absolutePath) ?? "",
    siblings,
  });
  return parsed === undefined
    ? { ok: false, reason: "working-file-unreadable" }
    : { ok: true, entries: parsed.entries };
}

function noDifference(path: string, state: LocaleGitDiffState): LocaleGitDiffResult {
  return { available: true, path, state, ...EMPTY_BODY };
}

/**
 * Compares one locale's file at `HEAD` with the file on disk, key by key: the keys added, the keys
 * removed, and the keys whose text changed, each with its text. It writes nothing, calls no
 * provider and takes no path from the caller: the file comes from the config and the locale.
 *
 * The committed file is read with `git cat-file blob`, checked to be a regular file no larger than
 * {@link LOCALE_GIT_BLOB_MAX_BYTES} first, and parsed by the built-in adapter for the configured
 * format over an in-memory file system. Both sides are compared as parsed keys, never as text, and
 * git never runs a diff, a text conversion driver or an external diff. The command safeguards of
 * {@link localeGitStatus} apply, including the minimal environment and the refusal to fetch lazily:
 * a committed file missing from a partial clone reads as `revision-unreadable`. What is compared
 * follows what is there: a file absent at `HEAD` compares against nothing, and a file absent on disk
 * compares to nothing, whatever git's status code says. A `conflicted` or `unchanged` file is not
 * compared and lists no difference. The file on disk is read only when it and every parent directory
 * are real, not symbolic links, and sit inside the project directory. For `apple-strings` the
 * `.stringsdict` file is read with the `.strings` file on both sides, and the state reported is the
 * `.strings` file's, else the `.stringsdict` file's. At most {@link LOCALE_GIT_DIFF_MAX_ENTRIES}
 * keys are listed, and each key and text is cut to {@link LOCALE_GIT_DIFF_MAX_VALUE_CHARS}
 * characters, either of which sets `truncated`, so the result stays bounded. The keys and texts are
 * the file's own and untrusted: show them as text.
 *
 * A locale whose file is shared with others, as in `apple-xcstrings`, is compared for that locale
 * alone. A `custom:` format, or a call that passes an `adapterRegistry`, returns `custom-adapter`
 * because a custom adapter cannot be run against a private in-memory file system.
 *
 * @param input - The config, the locale and the project directory.
 * @param deps - Optional process runner override, and an adapter registry that is refused.
 * @returns The difference, or `available: false` with a {@link LocaleGitUnavailableReason}.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the locale is neither the source nor a configured
 * target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 *
 * @example
 * ```ts
 * import { loadConfig, localeGitDiff } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const diff = await localeGitDiff({ config, locale: "de" });
 * if (diff.available) {
 *   for (const change of diff.changed) {
 *     console.log(change.key, change.before, "->", change.after);
 *   }
 * }
 * ```
 */
export async function localeGitDiff(
  input: LocaleGitDiffInput,
  deps: LocaleGitDiffDeps = {},
): Promise<LocaleGitDiffResult> {
  if (input.locale !== input.config.sourceLocale) {
    assertTargetLocale(input.config, input.locale);
  }
  const cwd = resolvePath(projectCwd(input));
  const absolutePath = createLocalePathResolver(cwd, input.config).pathFor(input.locale);
  const watched = watchedFiles(cwd, input.config);
  const file = watched.find(
    (candidate) => candidate.siblingOf === undefined && candidate.locales.includes(input.locale),
  );
  if (deps.adapterRegistry !== undefined || isCustomFormatId(input.config.format)) {
    return { available: false, reason: "custom-adapter" };
  }
  if (file === undefined) {
    return { available: false, reason: "working-file-unreadable" };
  }
  const siblings = watched.filter((candidate) => candidate.siblingOf === file.path);
  const opened = await openGitWorkTree(deps.execFile ?? defaultGitExecFile, cwd);
  if (!opened.ok) {
    return { available: false, reason: opened.reason };
  }
  const queried = await queryFileStates(opened.tree, [file, ...siblings]);
  if (!queried.ok) {
    return { available: false, reason: queried.reason };
  }
  const found = queried.states.get(file.path);
  const changedSiblings = siblings.flatMap((sibling) => queried.states.get(sibling.path) ?? []);
  const states = [...(found === undefined ? [] : [found]), ...changedSiblings];
  const state = states[0]?.state;
  if (state === undefined) {
    return noDifference(file.path, "unchanged");
  }
  if (states.some((entry) => entry.state === "conflicted")) {
    return noDifference(file.path, "conflicted");
  }
  const sideInput: SideInput = {
    config: input.config,
    locale: input.locale,
    root: cwd,
    absolutePath,
    siblingPaths: siblings.map((sibling) => resolvePath(cwd, sibling.path)),
  };
  const headFiles: HeadFile[] = [
    { absolutePath, repoPath: found?.repoPath ?? opened.tree.prefix + file.path },
    ...siblings.map((sibling) => ({
      absolutePath: resolvePath(cwd, sibling.path),
      repoPath: queried.states.get(sibling.path)?.repoPath ?? opened.tree.prefix + sibling.path,
    })),
  ];
  const head = await readHeadSide(opened.tree, sideInput, headFiles);
  const working = await readWorkingSide(sideInput);
  if (!head.ok) {
    return { available: false, reason: head.reason };
  }
  if (!working.ok) {
    return { available: false, reason: working.reason };
  }
  return {
    available: true,
    path: file.path,
    state,
    ...compareResources(head.entries, working.entries),
  };
}

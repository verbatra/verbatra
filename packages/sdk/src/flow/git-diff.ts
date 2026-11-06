import { basename, dirname, resolve as resolvePath } from "node:path";
import { isCustomFormatId, type LocaleResource } from "@verbatra/core";
import { type AdapterRegistry, createDefaultRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import { parseRevisionContent, readBlobAtHead } from "./git-revision.js";
import {
  type FileState,
  type LocaleGitFileState,
  queryFileStates,
  type WatchedFile,
  watchedFiles,
} from "./git-status.js";
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
        collector.added.push({ key, value: collector.text(entry.value) });
      }
    } else if (previous.value !== entry.value && collector.take()) {
      collector.changed.push({
        key,
        before: collector.text(previous.value),
        after: collector.text(entry.value),
      });
    }
  }
  for (const [key, entry] of before) {
    if (!after.has(key) && collector.take()) {
      collector.removed.push({ key, value: collector.text(entry.value) });
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
  readonly absolutePath: string;
}

async function readHeadSide(tree: GitWorkTree, file: FileState, input: SideInput): Promise<Side> {
  const blob = await readBlobAtHead(tree, file.repoPath);
  if (blob.kind === "absent") {
    return NOTHING;
  }
  if (blob.kind === "failed") {
    return { ok: false, reason: blob.reason };
  }
  const parsed =
    blob.kind === "ok"
      ? await parseRevisionContent({
          format: input.config.format,
          locale: input.locale,
          absolutePath: input.absolutePath,
          content: blob.content,
        })
      : undefined;
  return parsed === undefined
    ? { ok: false, reason: "revision-unreadable" }
    : { ok: true, entries: parsed.entries };
}

export async function isRegularFile(path: string): Promise<boolean> {
  try {
    const name = basename(path);
    const siblings = (await defaultFs.readDirectory?.(dirname(path))) ?? [];
    const exact = siblings.find((entry) => entry.name === name);
    const folded = siblings.filter((entry) => entry.name.toLowerCase() === name.toLowerCase());
    const found = exact ?? (folded.length === 1 ? folded[0] : undefined);
    return found?.kind === "file";
  } catch {
    return false;
  }
}

async function readDiskResource(input: SideInput): Promise<LocaleResource | undefined> {
  const resolution = createDefaultRegistry().resolve("", { format: input.config.format });
  if (resolution.status !== "resolved" || !(await isRegularFile(input.absolutePath))) {
    return undefined;
  }
  try {
    return (await resolution.adapter.read(input.absolutePath, input.locale)).resource;
  } catch {
    return undefined;
  }
}

async function readWorkingSide(file: FileState, input: SideInput): Promise<Side> {
  if (file.state === "deleted") {
    return NOTHING;
  }
  const resource = await readDiskResource(input);
  return resource === undefined
    ? { ok: false, reason: "working-file-unreadable" }
    : { ok: true, entries: resource.entries };
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
 * {@link localeGitStatus} apply. A file with no commit yet, or untracked, compares against nothing;
 * a deleted one compares to nothing; a `conflicted` or `unchanged` one is not compared and lists no
 * difference. A symbolic link on disk is refused. At most {@link LOCALE_GIT_DIFF_MAX_ENTRIES} keys
 * are listed and each text is cut to {@link LOCALE_GIT_DIFF_MAX_VALUE_CHARS} characters, either of
 * which sets `truncated`. The texts are the file's own and untrusted: show them as text.
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
  const file = watchedFiles(cwd, input.config).find((watched: WatchedFile) =>
    watched.locales.includes(input.locale),
  );
  if (deps.adapterRegistry !== undefined || isCustomFormatId(input.config.format)) {
    return { available: false, reason: "custom-adapter" };
  }
  if (file === undefined) {
    return { available: false, reason: "working-file-unreadable" };
  }
  const opened = await openGitWorkTree(deps.execFile ?? defaultGitExecFile, cwd);
  if (!opened.ok) {
    return { available: false, reason: opened.reason };
  }
  const queried = await queryFileStates(opened.tree, [file]);
  if (!queried.ok) {
    return { available: false, reason: queried.reason };
  }
  const found = queried.states.get(file.path);
  if (found === undefined) {
    return noDifference(file.path, "unchanged");
  }
  if (found.state === "conflicted") {
    return noDifference(file.path, "conflicted");
  }
  const sideInput: SideInput = { config: input.config, locale: input.locale, absolutePath };
  const head = await readHeadSide(opened.tree, found, sideInput);
  const working = await readWorkingSide(found, sideInput);
  if (!head.ok) {
    return { available: false, reason: head.reason };
  }
  if (!working.ok) {
    return { available: false, reason: working.reason };
  }
  return {
    available: true,
    path: file.path,
    state: found.state,
    ...compareResources(head.entries, working.entries),
  };
}

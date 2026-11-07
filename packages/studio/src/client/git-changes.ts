import type {
  GitFileState,
  GitLocaleDiffResult,
  GitStatusResult,
  GitUnavailableReason,
} from "../shared/rpc/git.js";
import type { KeyRevisionsResult } from "../shared/rpc/key-revisions.js";
import { routeHash } from "./routes.js";
import type { FetchOutcome, RefreshableView, StructuredError } from "./state.js";
import { applyRefreshOutcome } from "./state.js";

export const GIT_DIFF_MAX_ENTRIES = 500;

export const GIT_DIFF_MAX_VALUE_CHARS = 2000;

export const GIT_DIFF_PAGE_SIZE = 50;

export const INITIAL_FILE_ROWS = 10;

export type GitAvailableStatus = Extract<GitStatusResult, { readonly available: true }>;

export type GitUnavailableStatus = Extract<GitStatusResult, { readonly available: false }>;

export type GitAvailableDiff = Extract<GitLocaleDiffResult, { readonly available: true }>;

export type GitFile = GitAvailableStatus["files"][number];

export interface GitStatusData {
  readonly result: GitStatusResult;
  readonly lastAvailable: GitAvailableStatus | undefined;
}

export type GitStatusView = RefreshableView<GitStatusData>;

export type GitDiffView = RefreshableView<GitLocaleDiffResult>;

export function applyGitStatus(
  previous: GitStatusView,
  outcome: FetchOutcome<GitStatusResult>,
): GitStatusView {
  const kept = previous.kind === "data" ? previous.data.lastAvailable : undefined;
  const mapped: FetchOutcome<GitStatusData> = outcome.ok
    ? {
        ok: true,
        result: {
          result: outcome.result,
          lastAvailable: outcome.result.available ? outcome.result : kept,
        },
      }
    : outcome;
  return applyRefreshOutcome(previous, mapped);
}

export const GIT_UNAVAILABLE_MESSAGES: Readonly<Record<GitUnavailableReason, string>> = {
  "not-a-repository":
    "This project is not in a git repository, so there is nothing to compare. Nothing is wrong.",
  "git-missing": "Git is not installed or not on the PATH, so changes cannot be listed here.",
  "bare-repository": "This folder is inside a bare git repository, which has no working files.",
  "dubious-ownership":
    "Git does not trust this folder because another user owns it. Mark it as safe in git yourself if you trust it.",
  timeout: "Reading git took too long and was stopped.",
  "output-too-large": "Git returned more output than Studio reads, so changes are not shown.",
  "unsafe-config":
    "This repository configures a content filter that Studio will not run, so changes are not shown.",
  "git-too-old": "This repository needs a newer git than the one installed (2.45 or later).",
  "git-failed": "Git could not be read for this project.",
  "custom-adapter":
    "This project uses a custom format adapter, which Studio cannot compare with the last commit.",
  "revision-unreadable": "The committed version of this file could not be read or parsed.",
  "working-file-unreadable":
    "The file on disk could not be read or parsed, or it sits behind a symbolic link.",
  "outside-project":
    "A locale file of this project lies outside the project folder (a files pattern that starts with ../), so changes cannot be listed here.",
};

const TRANSIENT_REASONS: ReadonlySet<GitUnavailableReason> = new Set(["timeout", "git-failed"]);

export function transientGitError(
  result: GitStatusResult | GitLocaleDiffResult | KeyRevisionsResult,
): StructuredError | undefined {
  if (result.available || !TRANSIENT_REASONS.has(result.reason)) {
    return undefined;
  }
  return {
    code: result.reason === "timeout" ? "GIT_TIMEOUT" : "GIT_FAILED",
    message: GIT_UNAVAILABLE_MESSAGES[result.reason],
  };
}

export function applyGitDiff(
  previous: GitDiffView,
  outcome: FetchOutcome<GitLocaleDiffResult>,
): GitDiffView {
  if (outcome.ok && previous.kind === "data" && previous.data.available) {
    const transient = transientGitError(outcome.result);
    if (transient !== undefined) {
      return { kind: "data", data: previous.data, stale: true, error: transient };
    }
  }
  return applyRefreshOutcome(previous, outcome);
}

export const GIT_STATE_LABELS: Readonly<Record<GitFileState, string>> = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  untracked: "Untracked",
  conflicted: "Conflicted",
};

export type GitStateTone = "changed" | "success" | "danger" | "neutral" | "warning";

export const GIT_STATE_TONES: Readonly<Record<GitFileState, GitStateTone>> = {
  modified: "changed",
  added: "success",
  deleted: "danger",
  untracked: "neutral",
  conflicted: "warning",
};

export interface ChangeRow {
  readonly path: string;
  readonly locales: readonly string[];
  readonly state: GitFileState;
  readonly diffLocales: readonly string[];
  readonly clean: boolean;
}

export function changeRows(files: readonly GitFile[]): readonly ChangeRow[] {
  const offered = new Set<string>();
  return files.map((file) => {
    const diffLocales = file.locales.filter((locale) => !offered.has(locale));
    for (const locale of diffLocales) {
      offered.add(locale);
    }
    return {
      path: file.path,
      locales: file.locales,
      state: file.state,
      diffLocales,
      clean: false,
    };
  });
}

export interface OpenDiff {
  readonly locale: string;
  readonly path: string;
  readonly position: number;
}

export function withOpenRow(
  rows: readonly ChangeRow[],
  open: OpenDiff | undefined,
  diffState: GitFileState | "unchanged" | undefined,
): readonly ChangeRow[] {
  if (open === undefined || rows.some((row) => row.diffLocales.includes(open.locale))) {
    return rows;
  }
  const clean = diffState === undefined || diffState === "unchanged";
  const at = Math.min(Math.max(open.position, 0), rows.length);
  return [
    ...rows.slice(0, at),
    {
      path: open.path,
      locales: [open.locale],
      state: clean ? "modified" : diffState,
      diffLocales: [open.locale],
      clean,
    },
    ...rows.slice(at),
  ];
}

export type DiffSide = "added" | "changed" | "removed";

export function isCutText(text: string): boolean {
  return text.length >= GIT_DIFF_MAX_VALUE_CHARS - 1;
}

export function canOpenInTranslations(
  side: DiffSide,
  key: string,
  orphaned: ReadonlySet<string> | undefined,
): boolean {
  return (
    side !== "removed" &&
    key.length > 0 &&
    !isCutText(key) &&
    orphaned !== undefined &&
    !orphaned.has(key)
  );
}

export function translationsHash(locale: string, key: string): string {
  return routeHash({ page: "translations", params: { locale, key } });
}

export const TRUNCATED_NOTICE = `This list is incomplete: more than ${GIT_DIFF_MAX_ENTRIES} keys differ, or a key or value is longer than ${GIT_DIFF_MAX_VALUE_CHARS} characters and was cut. Use git itself for the full difference.`;

export const CONFLICT_NOTICE =
  "This file has unresolved merge conflicts, so Studio shows no key changes for it. Resolve them in git.";

export const UNCHANGED_NOTICE = "This file matches the last commit. No key changes.";

export const NO_KEY_DIFFERS_NOTICE =
  "No key differs: only the order or formatting of the file changed.";

export const CUT_NOTICE = `Cut at ${GIT_DIFF_MAX_VALUE_CHARS} characters.`;

export function diffTotal(diff: GitAvailableDiff): number {
  return diff.added.length + diff.removed.length + diff.changed.length;
}

export function diffSummary(diff: GitAvailableDiff): string {
  const counts = `${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed`;
  return diff.truncated && diffTotal(diff) >= GIT_DIFF_MAX_ENTRIES
    ? `${diffTotal(diff)}+ keys differ; listed: ${counts}`
    : counts;
}

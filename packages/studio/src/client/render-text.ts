import type { HistoryCommit } from "../shared/rpc/history.js";

export interface TextTarget {
  textContent: string | null;
}

export function renderText(target: TextTarget, text: string): void {
  target.textContent = text;
}

export interface CommitSummaryParts {
  readonly shortHash: string;
  readonly author: string;
  readonly dateLabel: string;
  readonly authorDate: string;
  readonly subject: string;
}

export function commitSummaryParts(commit: HistoryCommit): CommitSummaryParts {
  return {
    shortHash: commit.hash.slice(0, 7),
    author: commit.author,
    dateLabel: commit.authorDate.slice(0, 10),
    authorDate: commit.authorDate,
    subject: commit.subject,
  };
}

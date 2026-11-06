import { EmptyState } from "@verbatra/ui";
import type { ReactNode } from "react";
import { commitSummaryParts, renderText } from "../client/render-text.js";
import type { HistoryCommit, HistoryUnavailableReason } from "../shared/rpc/history.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { Loading } from "./Loading.js";
import type { HistoryState } from "./use-history-list.js";

function TouchedPaths({ paths }: { readonly paths: readonly string[] }): ReactNode {
  if (paths.length === 0) {
    return null;
  }
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-1 p-0" aria-label="Files changed">
      {paths.map((path) => (
        <li
          key={path}
          dir="auto"
          className="min-w-0 wrap-anywhere rounded-sm bg-neutral-soft px-2 py-0.5 font-mono text-xs text-muted-foreground"
        >
          {path}
        </li>
      ))}
    </ul>
  );
}

function CommitRow({ commit }: { readonly commit: HistoryCommit }): ReactNode {
  const parts = commitSummaryParts(commit);
  return (
    <li
      tabIndex={-1}
      className="relative rounded-sm border-s border-border pb-6 ps-5 last:border-s-transparent last:pb-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span
        className="absolute -start-1.25 top-1 size-2.5 rounded-full border-2 border-card bg-primary"
        aria-hidden="true"
      />
      <p
        dir="auto"
        data-commit-subject=""
        className="m-0 min-w-0 wrap-anywhere text-sm font-medium text-foreground"
        ref={(element) => {
          if (element !== null) {
            renderText(element, parts.subject);
          }
        }}
      />
      <p className="m-0 mt-1 flex flex-wrap items-center gap-2" data-commit-meta="">
        <span
          dir="ltr"
          className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
          ref={(element) => {
            if (element !== null) {
              renderText(element, parts.shortHash);
            }
          }}
        />
        <time
          dateTime={parts.authorDate}
          className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
          ref={(element) => {
            if (element !== null) {
              renderText(element, parts.dateLabel);
            }
          }}
        />
        <span
          dir="auto"
          data-commit-author=""
          className="min-w-0 wrap-anywhere text-xs font-medium text-muted-foreground"
          ref={(element) => {
            if (element !== null) {
              renderText(element, parts.author);
            }
          }}
        />
      </p>
      <TouchedPaths paths={commit.touchedPaths} />
    </li>
  );
}

export interface CommitListProps {
  readonly state: HistoryState;
  readonly compact?: boolean;
  readonly emptyMessage: string;
  readonly onRetry?: () => void;
}

const NO_GIT_MESSAGE = "This project is not a git repository, or git is not installed.";

const UNAVAILABLE_MESSAGES: Readonly<Record<HistoryUnavailableReason, string>> = {
  "git-missing": NO_GIT_MESSAGE,
  "not-a-repository": NO_GIT_MESSAGE,
  timeout: "Reading the git history took too long and was stopped.",
  "output-too-large": "The git history is too large to read here.",
};

type LoadedHistory = Extract<HistoryState, { readonly kind: "loaded" }>;

function LoadedCommits({
  state,
  compact,
  emptyMessage,
}: {
  readonly state: LoadedHistory;
  readonly compact: boolean;
  readonly emptyMessage: string;
}): ReactNode {
  if (state.commits.length === 0) {
    if (compact) {
      return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
    }
    return (
      <EmptyState icon="history" title="No commits yet">
        {emptyMessage}
      </EmptyState>
    );
  }
  return (
    <ul aria-label="Commits" className="m-0 ms-1 max-w-3xl list-none p-0">
      {state.commits.map((commit) => (
        <CommitRow commit={commit} key={commit.hash} />
      ))}
    </ul>
  );
}

export function CommitList({
  state,
  compact = false,
  emptyMessage,
  onRetry,
}: CommitListProps): ReactNode {
  if (state.kind === "loading") {
    return <Loading />;
  }
  if (state.kind === "error") {
    return <ErrorMessage error={state.error} {...(onRetry === undefined ? {} : { onRetry })} />;
  }
  if (state.kind === "unavailable") {
    const message = UNAVAILABLE_MESSAGES[state.reason];
    if (compact) {
      return <p className="text-sm text-muted-foreground">{message}</p>;
    }
    return (
      <EmptyState icon="history" title="History unavailable">
        {message}
      </EmptyState>
    );
  }
  return (
    <>
      {state.staleError !== undefined ? (
        <ErrorMessage
          error={state.staleError}
          prefix="Showing the last known history."
          {...(onRetry === undefined ? {} : { onRetry })}
        />
      ) : null}
      <LoadedCommits state={state} compact={compact} emptyMessage={emptyMessage} />
    </>
  );
}

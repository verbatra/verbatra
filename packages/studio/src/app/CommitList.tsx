import type { ReactNode } from "react";
import { commitSummaryParts, renderText } from "../client/render-text.js";
import type { HistoryCommit } from "../shared/rpc/history.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { Loading } from "./Loading.js";
import { EmptyState } from "./ui.js";
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
          className="break-words rounded-md bg-neutral-soft px-2 py-0.5 font-mono text-xs text-muted-foreground"
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
    <li className="relative border-s border-border pb-6 ps-5 last:border-s-transparent last:pb-0">
      <span
        className="absolute -start-[5px] top-1 size-2.5 rounded-full border-2 border-card bg-primary"
        aria-hidden="true"
      />
      <p
        className="m-0 text-sm font-medium text-foreground"
        ref={(element) => {
          if (element !== null) {
            renderText(element, parts.subject);
          }
        }}
      />
      <p className="m-0 mt-1 flex flex-wrap items-center gap-2">
        <span
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
          ref={(element) => {
            if (element !== null) {
              renderText(element, parts.shortHash);
            }
          }}
        />
        <span
          className="text-xs text-foreground"
          ref={(element) => {
            if (element !== null) {
              renderText(element, parts.author);
            }
          }}
        />
        <span
          className="text-xs text-muted-foreground"
          title={parts.authorDate}
          ref={(element) => {
            if (element !== null) {
              renderText(element, parts.dateLabel);
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
}

const UNAVAILABLE_MESSAGE = "This project is not a git repository, or git is not installed.";

export function CommitList({ state, compact = false, emptyMessage }: CommitListProps): ReactNode {
  if (state.kind === "loading") {
    return <Loading />;
  }
  if (state.kind === "error") {
    return <ErrorMessage error={state.error} />;
  }
  if (state.kind === "unavailable") {
    if (compact) {
      return <p className="text-sm text-muted-foreground">{UNAVAILABLE_MESSAGE}</p>;
    }
    return (
      <EmptyState icon="history" title="History unavailable">
        {UNAVAILABLE_MESSAGE}
      </EmptyState>
    );
  }
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
    <ul className="m-0 ms-1 max-w-3xl list-none p-0">
      {state.commits.map((commit) => (
        <CommitRow commit={commit} key={commit.hash} />
      ))}
    </ul>
  );
}

import type { ReactNode } from "react";
import { useState } from "react";
import {
  type BatchFailureGroup,
  type BatchSummary,
  batchSummaryFailed,
  batchSummaryHeadline,
  groupBatchFailures,
} from "../client/review-batch-outcome.js";
import { Button } from "./Button.js";
import { actionStatusTextClassName } from "./lib/action-status-classes.js";
import { cn } from "./lib/cn.js";

export type DecisionNotice =
  | {
      readonly kind: "approved" | "rejected" | "retranslated" | "updated" | "already-running";
      readonly locale: string;
      readonly key: string;
    }
  | {
      readonly kind: "failed";
      readonly action: "approve" | "reject" | "retranslate";
      readonly locale: string;
      readonly key: string;
      readonly message: string;
    }
  | { readonly kind: "batch"; readonly summary: BatchSummary };

export const VISIBLE_FAILURE_ENTRIES = 6;

function noticeText(notice: DecisionNotice): string {
  if (notice.kind === "batch") {
    return batchSummaryHeadline(notice.summary);
  }
  const target = `${notice.key} (${notice.locale})`;
  switch (notice.kind) {
    case "approved":
      return `Approved ${target}. The decision is saved in verbatra.provenance.json.`;
    case "rejected":
      return `Rejected ${target}. Its translation was removed and the decision is saved in verbatra.provenance.json.`;
    case "retranslated":
      return `Retranslated ${target}. Review the new value, then approve or reject it.`;
    case "updated":
      return `Updated ${target}.`;
    case "already-running":
      return `${target} is already being retranslated. Its row shows the progress.`;
    default:
      return `Could not ${notice.action} ${target}: ${notice.message}`;
  }
}

export function noticeFailed(notice: DecisionNotice): boolean {
  return notice.kind === "batch" ? batchSummaryFailed(notice.summary) : notice.kind === "failed";
}

function capGroups(
  groups: readonly BatchFailureGroup[],
  limit: number,
): readonly BatchFailureGroup[] {
  const capped: BatchFailureGroup[] = [];
  let remaining = limit;
  for (const group of groups) {
    if (remaining <= 0) {
      break;
    }
    capped.push({ message: group.message, entries: group.entries.slice(0, remaining) });
    remaining -= group.entries.length;
  }
  return capped;
}

function FailureList({ summary }: { readonly summary: BatchSummary }): ReactNode {
  const [expanded, setExpanded] = useState(false);
  if (summary.kind !== "done" || summary.failures.length === 0) {
    return null;
  }
  const groups = groupBatchFailures(summary.failures);
  const total = summary.failures.length;
  const shown = expanded ? groups : capGroups(groups, VISIBLE_FAILURE_ENTRIES);
  return (
    <>
      <ul className="m-0 mt-1 list-none space-y-1.5 p-0" data-batch-failures="">
        {shown.map((group) => (
          <li key={group.message}>
            <span className="block">{group.message}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {group.entries.map((entry) => `${entry.key} (${entry.locale})`).join(", ")}
            </span>
          </li>
        ))}
      </ul>
      {total > VISIBLE_FAILURE_ENTRIES ? (
        <Button
          variant="ghost"
          className="mt-1 -ms-2"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show fewer" : `Show all ${total}`}
        </Button>
      ) : null}
    </>
  );
}

export function ReviewDecisionStatus({
  notice,
}: {
  readonly notice: DecisionNotice | null;
}): ReactNode {
  const failed = notice !== null && noticeFailed(notice);
  return (
    <div
      className={cn(
        "mb-3 min-h-4",
        actionStatusTextClassName(notice === null ? undefined : failed ? "failure" : "success"),
      )}
      role={failed ? "alert" : "status"}
      data-decision-status=""
    >
      {notice === null ? null : (
        <>
          <p className="m-0">{noticeText(notice)}</p>
          {notice.kind === "batch" ? <FailureList summary={notice.summary} /> : null}
        </>
      )}
    </div>
  );
}

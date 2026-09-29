import type { ReactNode } from "react";
import { type RowBusyAction, rowBusyLabel } from "../client/review-in-flight.js";
import { Button } from "./Button.js";
import { Card } from "./Card.js";

export interface ReviewBulkBarProps {
  readonly count: number;
  readonly actionable: number;
  readonly busyAction: RowBusyAction | undefined;
  readonly busyNote: string | null;
  readonly decisionBlocker: string | null;
  readonly retranslateBlocker: string | null;
  readonly approveDisabled?: boolean;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onRetranslate: (() => void) | undefined;
  readonly onClear: () => void;
}

const EMPTY_HINT = "Select entries with the checkboxes, or press x on the highlighted entry.";

function bulkHint(count: number, hints: readonly (string | null)[]): string {
  if (count === 0) {
    return EMPTY_HINT;
  }
  return hints.filter((hint): hint is string => hint !== null).join(" ");
}

export function ReviewBulkBar({
  count,
  actionable,
  busyAction,
  busyNote,
  decisionBlocker,
  retranslateBlocker,
  approveDisabled = false,
  onApprove,
  onReject,
  onRetranslate,
  onClear,
}: ReviewBulkBarProps): ReactNode {
  const running = busyAction !== undefined;
  const idle = actionable === 0 || running;
  const label = (action: RowBusyAction, text: string): string =>
    busyAction === action ? rowBusyLabel(action) : text;
  return (
    <Card
      as="section"
      padding="sm"
      aria-label="Bulk actions"
      className="mb-4 flex flex-wrap items-center gap-3 border-s-2 border-s-primary"
    >
      <p
        className="m-0 min-w-24 whitespace-nowrap text-sm font-semibold text-foreground"
        aria-live="polite"
      >
        {count === 0 ? "None selected" : `${count} selected`}
      </p>
      <span className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary-success"
          className="w-32"
          disabled={idle || decisionBlocker !== null || approveDisabled}
          onClick={onApprove}
        >
          {label("approve", "Approve selected")}
        </Button>
        <Button
          variant="secondary-danger"
          className="w-32"
          disabled={idle || decisionBlocker !== null}
          onClick={onReject}
        >
          {label("reject", "Reject selected…")}
        </Button>
        {onRetranslate !== undefined ? (
          <Button
            className="w-36"
            disabled={idle || retranslateBlocker !== null}
            onClick={onRetranslate}
          >
            {label("retranslate", "Retranslate selected")}
          </Button>
        ) : null}
        <Button variant="ghost" disabled={count === 0 || running} onClick={onClear}>
          Clear selection
        </Button>
      </span>
      <p className="m-0 min-h-4 w-full text-xs text-muted-foreground" data-bulk-hint="">
        {bulkHint(count, [
          busyNote,
          decisionBlocker,
          onRetranslate === undefined ? null : retranslateBlocker,
        ])}
      </p>
    </Card>
  );
}

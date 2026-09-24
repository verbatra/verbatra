import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { Card } from "./Card.js";

export interface ReviewBulkBarProps {
  readonly count: number;
  readonly busy: boolean;
  readonly decisionBlocker: string | null;
  readonly retranslateBlocker: string | null;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onRetranslate: (() => void) | undefined;
  readonly onClear: () => void;
}

export function ReviewBulkBar({
  count,
  busy,
  decisionBlocker,
  retranslateBlocker,
  onApprove,
  onReject,
  onRetranslate,
  onClear,
}: ReviewBulkBarProps): ReactNode {
  const hints = [decisionBlocker, onRetranslate === undefined ? null : retranslateBlocker].filter(
    (hint): hint is string => hint !== null,
  );
  return (
    <Card
      as="section"
      padding="sm"
      aria-label="Bulk actions"
      className="mb-4 flex flex-wrap items-center gap-3 border-s-[3px] border-s-primary"
    >
      <p className="m-0 text-sm font-semibold text-foreground" aria-live="polite">
        {count} selected
      </p>
      <span className="flex flex-wrap items-center gap-2">
        <Button
          className="text-success"
          disabled={busy || decisionBlocker !== null}
          onClick={onApprove}
        >
          Approve selected
        </Button>
        <Button
          className="text-danger"
          disabled={busy || decisionBlocker !== null}
          onClick={onReject}
        >
          Reject selected…
        </Button>
        {onRetranslate !== undefined ? (
          <Button disabled={busy || retranslateBlocker !== null} onClick={onRetranslate}>
            Retranslate selected
          </Button>
        ) : null}
        <Button variant="ghost" disabled={busy} onClick={onClear}>
          Clear selection
        </Button>
      </span>
      {hints.length > 0 ? (
        <p className="m-0 w-full text-xs text-muted-foreground">{hints.join(" ")}</p>
      ) : null}
    </Card>
  );
}

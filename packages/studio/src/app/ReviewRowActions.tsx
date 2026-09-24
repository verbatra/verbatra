import type { ReactNode } from "react";
import { shortcutKeysFor } from "../client/review-shortcuts.js";
import { Button } from "./Button.js";

export function ReviewRowActions({
  onApprove,
  onReject,
  onEdit,
  onRetranslate,
  decisionDisabled = false,
  pendingLabel,
}: {
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onEdit: () => void;
  readonly onRetranslate?: (() => void) | undefined;
  readonly decisionDisabled?: boolean;
  readonly pendingLabel?: string;
}): ReactNode {
  const busy = pendingLabel !== undefined;
  return (
    <span className="relative ms-2 inline-flex items-center gap-2 whitespace-nowrap">
      <Button onClick={onEdit} disabled={busy} aria-keyshortcuts={shortcutKeysFor("edit")}>
        Edit
      </Button>
      <Button
        className="min-w-[5.75rem] text-success"
        onClick={onApprove}
        disabled={busy || decisionDisabled}
        aria-keyshortcuts={shortcutKeysFor("approve")}
      >
        {busy ? pendingLabel : "Approve"}
      </Button>
      <Button
        className="text-danger"
        onClick={onReject}
        disabled={busy || decisionDisabled}
        aria-keyshortcuts={shortcutKeysFor("reject")}
      >
        Reject…
      </Button>
      {onRetranslate !== undefined ? (
        <Button
          onClick={onRetranslate}
          disabled={busy}
          aria-keyshortcuts={shortcutKeysFor("retranslate")}
        >
          Retranslate
        </Button>
      ) : null}
      <span className="sr-only" role="status">
        {busy ? pendingLabel : ""}
      </span>
    </span>
  );
}

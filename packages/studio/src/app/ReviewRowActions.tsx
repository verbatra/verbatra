import type { ReactNode } from "react";
import { Button } from "./Button.js";

export function ReviewRowActions({
  onApprove,
  onReject,
  onEdit,
  decisionDisabled = false,
  pendingLabel,
}: {
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onEdit: () => void;
  readonly decisionDisabled?: boolean;
  readonly pendingLabel?: string;
}): ReactNode {
  const busy = pendingLabel !== undefined;
  return (
    <span className="ms-2 inline-flex items-center gap-2 whitespace-nowrap">
      <Button onClick={onEdit} disabled={busy}>
        Edit
      </Button>
      <Button
        className="min-w-[5.75rem] text-success"
        onClick={onApprove}
        disabled={busy || decisionDisabled}
      >
        {busy ? pendingLabel : "Approve"}
      </Button>
      <Button className="text-danger" onClick={onReject} disabled={busy || decisionDisabled}>
        Reject…
      </Button>
      <span className="sr-only" role="status">
        {busy ? pendingLabel : ""}
      </span>
    </span>
  );
}

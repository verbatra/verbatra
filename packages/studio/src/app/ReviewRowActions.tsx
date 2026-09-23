import type { ReactNode } from "react";
import { Button } from "./Button.js";

export function ReviewRowActions({
  onApprove,
  onReject,
  onEdit,
  decisionDisabled = false,
}: {
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onEdit: () => void;
  readonly decisionDisabled?: boolean;
}): ReactNode {
  return (
    <span className="ms-2 inline-flex items-center gap-2">
      <Button onClick={onEdit}>Edit</Button>
      <Button className="text-success" onClick={onApprove} disabled={decisionDisabled}>
        Approve
      </Button>
      <Button className="text-danger" onClick={onReject} disabled={decisionDisabled}>
        Reject…
      </Button>
    </span>
  );
}

import type { ReviewReasonCode } from "@verbatra/sdk";
import { Badge } from "@verbatra/ui";
import type { ReactNode } from "react";
import { reviewReasonLabel } from "../client/review-reason-labels.js";

export function ReviewReasonChips({
  reasons,
}: {
  readonly reasons: readonly ReviewReasonCode[];
}): ReactNode {
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((reason) => {
        const view = reviewReasonLabel(reason);
        return (
          <Badge tone={view.tone} key={reason}>
            {view.label}
          </Badge>
        );
      })}
    </span>
  );
}

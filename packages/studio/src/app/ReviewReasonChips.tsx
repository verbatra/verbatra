import type { ReviewReasonCode } from "@verbatra/sdk";
import type { ReactNode } from "react";
import { reviewReasonLabel } from "../client/review-reason-labels.js";
import { Badge } from "./Badge.js";

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

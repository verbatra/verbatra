import { Icon } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { KeyLocaleStatus } from "../client/diff-view.js";
import type { KeyStatus } from "../client/key-status-filter.js";
import { KeyLocaleStatusBadge } from "./DiffBadge.js";

export function KeyStatusCell({
  status,
  held,
}: {
  readonly status: KeyLocaleStatus;
  readonly held: ReadonlySet<KeyStatus> | undefined;
}): ReactNode {
  const inReview = held?.has("review") === true;
  const broken = held?.has("integrity") === true;
  return (
    <span className="inline-flex items-center gap-1.5">
      <KeyLocaleStatusBadge status={status} />
      {inReview ? (
        <span className="inline-flex text-warning" data-marker="review">
          <Icon name="review" size={14} />
          <span className="sr-only">In the review queue</span>
        </span>
      ) : null}
      {broken ? (
        <span className="inline-flex text-danger" data-marker="integrity">
          <Icon name="alert" size={14} />
          <span className="sr-only">Integrity problem</span>
        </span>
      ) : null}
    </span>
  );
}

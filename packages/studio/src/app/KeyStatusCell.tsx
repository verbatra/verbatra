import { Icon, Tooltip } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { KeyLocaleStatus } from "../client/diff-view.js";
import type { KeyStatus } from "../client/key-status-filter.js";
import { KeyLocaleStatusBadge } from "./DiffBadge.js";

const REVIEW_TEXT = "In the review queue";
const INTEGRITY_TEXT = "Integrity problem";

function markerTexts(held: ReadonlySet<KeyStatus> | undefined): readonly string[] {
  return [
    ...(held?.has("review") === true ? [REVIEW_TEXT] : []),
    ...(held?.has("integrity") === true ? [INTEGRITY_TEXT] : []),
  ];
}

export function MarkerTip({
  held,
  children,
}: {
  readonly held: ReadonlySet<KeyStatus> | undefined;
  readonly children: ReactNode;
}): ReactNode {
  const texts = markerTexts(held);
  return texts.length === 0 ? (
    children
  ) : (
    <Tooltip label={texts.join(", ")} side="bottom">
      {children}
    </Tooltip>
  );
}

export function KeyStatusCell({
  status,
  held,
}: {
  readonly status: KeyLocaleStatus;
  readonly held: ReadonlySet<KeyStatus> | undefined;
}): ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5">
      <KeyLocaleStatusBadge status={status} />
      {held?.has("review") === true ? (
        <span className="inline-flex text-warning" data-marker="review">
          <Icon name="inbox" size={14} />
          <span className="sr-only">{`, ${REVIEW_TEXT}`}</span>
        </span>
      ) : null}
      {held?.has("integrity") === true ? (
        <span className="inline-flex text-danger" data-marker="integrity">
          <Icon name="alert" size={14} />
          <span className="sr-only">{`, ${INTEGRITY_TEXT}`}</span>
        </span>
      ) : null}
    </span>
  );
}

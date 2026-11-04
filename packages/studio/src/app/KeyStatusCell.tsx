import { Icon, Tooltip } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { KeyLocaleStatus } from "../client/diff-view.js";
import type { KeyStatus } from "../client/key-status-filter.js";
import { KeyLocaleStatusBadge, keyLocaleStatusLabel } from "./DiffBadge.js";

const REVIEW_TEXT = "in the review queue";
const INTEGRITY_TEXT = "integrity problem";

function markerTexts(held: ReadonlySet<KeyStatus> | undefined): readonly string[] {
  return [
    ...(held?.has("review") === true ? [REVIEW_TEXT] : []),
    ...(held?.has("integrity") === true ? [INTEGRITY_TEXT] : []),
  ];
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function cellName(
  key: string,
  locale: string,
  status: KeyLocaleStatus,
  held: ReadonlySet<KeyStatus> | undefined,
): string {
  const markers = markerTexts(held).map((text) => `, ${text}`);
  return `${key} in ${locale}: ${keyLocaleStatusLabel(status)}${markers.join("")}`;
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
    <Tooltip label={sentence(texts.join(", "))} side="bottom" decorative className="flex w-full">
      {children}
    </Tooltip>
  );
}

export function KeyStatusCell({
  status,
  held,
  announce = true,
}: {
  readonly status: KeyLocaleStatus;
  readonly held: ReadonlySet<KeyStatus> | undefined;
  readonly announce?: boolean;
}): ReactNode {
  return (
    <span className="inline-block whitespace-nowrap">
      <KeyLocaleStatusBadge status={status} />
      {held?.has("review") === true ? (
        <span
          aria-hidden="true"
          className="ms-1.5 inline-flex align-middle text-warning"
          data-marker="review"
        >
          <Icon name="inbox" size={14} />
        </span>
      ) : null}
      {held?.has("integrity") === true ? (
        <span
          aria-hidden="true"
          className="ms-1.5 inline-flex align-middle text-danger"
          data-marker="integrity"
        >
          <Icon name="alert" size={14} />
        </span>
      ) : null}
      {announce
        ? markerTexts(held).map((text) => (
            <span
              key={text}
              className="overflow-hidden text-[0px] [clip-path:inset(50%)]"
            >{`, ${text}`}</span>
          ))
        : null}
    </span>
  );
}

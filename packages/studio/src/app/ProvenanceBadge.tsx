import type { KeyProvenance } from "@verbatra/sdk";
import { Badge, Tooltip, type TooltipSide } from "@verbatra/ui";
import type { ReactNode } from "react";
import { provenanceBadgeView } from "../client/provenance-view.js";

export function ProvenanceBadge({
  provenance,
  tooltipSide = "bottom-start",
  wrap = false,
}: {
  readonly provenance: KeyProvenance | undefined;
  readonly tooltipSide?: TooltipSide;
  readonly wrap?: boolean;
}): ReactNode {
  const view = provenanceBadgeView(provenance);
  if (view === null) {
    return null;
  }
  return (
    <Tooltip label={view.description} side={tooltipSide} flip wide decorative>
      <Badge tone={view.tone} wrap={wrap}>
        <span className="sr-only"> Origin: </span>
        {view.label}
        <span className="sr-only">. {view.description}</span>
      </Badge>
    </Tooltip>
  );
}

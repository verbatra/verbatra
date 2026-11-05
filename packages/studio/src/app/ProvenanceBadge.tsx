import type { KeyProvenance } from "@verbatra/sdk";
import { Badge, Tooltip } from "@verbatra/ui";
import type { ReactNode } from "react";
import { provenanceBadgeView } from "../client/provenance-view.js";

export function ProvenanceBadge({
  provenance,
}: {
  readonly provenance: KeyProvenance | undefined;
}): ReactNode {
  const view = provenanceBadgeView(provenance);
  if (view === null) {
    return null;
  }
  return (
    <Tooltip label={view.description} side="bottom-start" flip wide decorative>
      <Badge tone={view.tone}>
        <span className="sr-only"> Origin: </span>
        {view.label}
        <span className="sr-only">. {view.description}</span>
      </Badge>
    </Tooltip>
  );
}

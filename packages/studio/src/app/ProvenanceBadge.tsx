import type { KeyProvenance } from "@verbatra/sdk";
import type { ReactNode } from "react";
import { provenanceBadgeView } from "../client/provenance-view.js";
import { Badge } from "./Badge.js";

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
    <span title={view.description} className="inline-flex">
      <Badge tone={view.tone}>
        <span className="sr-only"> Origin: </span>
        {view.label}
        <span className="sr-only">. {view.description}</span>
      </Badge>
    </span>
  );
}

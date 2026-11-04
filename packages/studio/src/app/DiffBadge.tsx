import { Badge } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { KeyLocaleStatus } from "../client/diff-view.js";

export type DiffTone = "missing" | "changed" | "orphaned" | "protected";

const DIFF_LABEL: Readonly<Record<DiffTone, string>> = {
  missing: "Missing",
  changed: "Changed",
  orphaned: "Orphaned",
  protected: "Protected",
};

export function isDiffTone(value: string): value is DiffTone {
  return Object.hasOwn(DIFF_LABEL, value);
}

export function keyLocaleStatusLabel(status: KeyLocaleStatus): string {
  if (status === "in-sync") {
    return "In sync";
  }
  if (status === "absent") {
    return "Absent";
  }
  return DIFF_LABEL[status];
}

export function DiffBadge({ tone }: { readonly tone: DiffTone }): ReactNode {
  return <Badge tone={tone}>{keyLocaleStatusLabel(tone)}</Badge>;
}

export function KeyLocaleStatusBadge({ status }: { readonly status: KeyLocaleStatus }): ReactNode {
  if (status === "in-sync") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        data-status="in-sync"
      >
        <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-success" />
        {keyLocaleStatusLabel(status)}
      </span>
    );
  }
  if (status === "absent") {
    return <Badge tone="neutral">{keyLocaleStatusLabel(status)}</Badge>;
  }
  return <DiffBadge tone={status} />;
}

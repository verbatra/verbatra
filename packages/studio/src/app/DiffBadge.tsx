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

export function DiffBadge({ tone }: { readonly tone: DiffTone }): ReactNode {
  return <Badge tone={tone}>{DIFF_LABEL[tone]}</Badge>;
}

export function KeyLocaleStatusBadge({ status }: { readonly status: KeyLocaleStatus }): ReactNode {
  if (status === "in-sync") {
    return <Badge tone="success">In sync</Badge>;
  }
  if (status === "absent") {
    return <Badge tone="neutral">Absent</Badge>;
  }
  return <DiffBadge tone={status} />;
}

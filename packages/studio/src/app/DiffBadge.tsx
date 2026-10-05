import type { ReactNode } from "react";
import type { KeyLocaleStatus } from "../client/diff-view.js";
import { Badge } from "./Badge.js";
import { cn } from "./lib/cn.js";
import { pillClassName, pillDotClassName } from "./ui.js";

export type DiffTone = "missing" | "changed" | "orphaned" | "protected";

const DIFF_LABEL: Readonly<Record<DiffTone, string>> = {
  missing: "Missing",
  changed: "Changed",
  orphaned: "Orphaned",
  protected: "Protected",
};

const DIFF_TONE_CLASSES: Readonly<Record<DiffTone, string>> = {
  missing: "bg-diff-new-soft text-diff-new",
  changed: "bg-diff-changed-soft text-diff-changed",
  orphaned: "bg-diff-orphaned-soft text-diff-orphaned",
  protected: "bg-warning-soft text-warning",
};

export function DiffBadge({ tone }: { readonly tone: DiffTone }): ReactNode {
  return (
    <span className={cn(pillClassName, DIFF_TONE_CLASSES[tone])}>
      <span className={pillDotClassName} aria-hidden="true" />
      {DIFF_LABEL[tone]}
    </span>
  );
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

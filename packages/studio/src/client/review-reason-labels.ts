import type { ReviewReasonCode } from "@verbatra/sdk";

export type ReviewReasonTone = "success" | "warning" | "neutral" | "danger";

export interface ReviewReasonLabelView {
  readonly label: string;
  readonly tone: ReviewReasonTone;
}

const REVIEW_REASON_LABELS: Readonly<Record<ReviewReasonCode, ReviewReasonLabelView>> = {
  LENGTH_RATIO_OUTLIER: { label: "Unusual length", tone: "warning" },
  MAX_LENGTH_EXCEEDED: { label: "Over length budget", tone: "warning" },
  EQUALS_SOURCE: { label: "Matches source text", tone: "warning" },
  GLOSSARY_TERM_MISSED: { label: "Glossary term missed", tone: "warning" },
  INTEGRITY_REORDERED: { label: "Placeholders reordered", tone: "warning" },
  PROVIDER_DEGRADED: { label: "Provider degraded", tone: "neutral" },
};

export function reviewReasonLabel(code: ReviewReasonCode): ReviewReasonLabelView {
  return REVIEW_REASON_LABELS[code];
}

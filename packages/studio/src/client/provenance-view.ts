import type { KeyOrigin, KeyProvenance, KeyReviewState, ProvenanceSummary } from "@verbatra/sdk";

export type ProvenanceTone = "success" | "warning" | "neutral";

export interface ProvenanceBadgeView {
  readonly label: string;
  readonly tone: ProvenanceTone;
  readonly description: string;
}

const ORIGIN_VIEWS: Readonly<Record<KeyOrigin, ProvenanceBadgeView>> = {
  machine: {
    label: "Machine",
    tone: "neutral",
    description: "Written by a translation provider.",
  },
  memory: {
    label: "Memory",
    tone: "neutral",
    description: "Reused from the translation memory as an exact match.",
  },
  fuzzy: {
    label: "Fuzzy match",
    tone: "warning",
    description: "Reused from the translation memory for a similar source string.",
  },
  agent: {
    label: "Agent",
    tone: "neutral",
    description: "Written by an AI agent through an editing tool.",
  },
  human: {
    label: "Human",
    tone: "success",
    description: "Written by a person.",
  },
  import: {
    label: "Import",
    tone: "success",
    description: "Read from a translator handoff.",
  },
  unknown: {
    label: "Unknown",
    tone: "neutral",
    description: "Recorded without a known author.",
  },
  unrecorded: {
    label: "Unrecorded",
    tone: "neutral",
    description: "No provenance recorded for this value yet.",
  },
  external: {
    label: "Edited outside verbatra",
    tone: "warning",
    description: "Changed since verbatra recorded who wrote it.",
  },
};

const REVIEW_LABELS: Readonly<Record<KeyReviewState, string>> = {
  unreviewed: "Not reviewed",
  approved: "Approved",
  rejected: "Rejected",
};

export const ORIGIN_ORDER: readonly KeyOrigin[] = [
  "machine",
  "memory",
  "fuzzy",
  "agent",
  "human",
  "import",
  "external",
  "unknown",
  "unrecorded",
];

export function provenanceBadgeView(
  provenance: KeyProvenance | undefined,
): ProvenanceBadgeView | null {
  return provenance === undefined ? null : ORIGIN_VIEWS[provenance.origin];
}

export interface ProvenanceDetailItem {
  readonly label: string;
  readonly value: string;
  readonly identifier: boolean;
}

export function provenanceDetailItems(provenance: KeyProvenance): readonly ProvenanceDetailItem[] {
  const items: ProvenanceDetailItem[] = [];
  if (provenance.provider !== undefined) {
    items.push({ label: "Provider", value: provenance.provider, identifier: true });
  }
  if (provenance.model !== undefined) {
    items.push({ label: "Model", value: provenance.model, identifier: true });
  }
  items.push({
    label: "Review",
    value: REVIEW_LABELS[provenance.reviewState],
    identifier: false,
  });
  if (provenance.reviewer !== undefined) {
    items.push({ label: "Reviewer", value: provenance.reviewer, identifier: false });
  }
  return items;
}

export function provenanceSummaryParts(summary: ProvenanceSummary | undefined): readonly string[] {
  if (summary === undefined) {
    return ["Unavailable"];
  }
  const parts = ORIGIN_ORDER.filter((origin) => summary.byOrigin[origin] > 0).map(
    (origin) => `${summary.byOrigin[origin]} ${ORIGIN_VIEWS[origin].label.toLowerCase()}`,
  );
  return parts.length === 0 ? ["No values"] : parts;
}

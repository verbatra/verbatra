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

export function provenanceDetailItems(
  provenance: KeyProvenance,
): ReadonlyArray<readonly [string, string]> {
  const items: [string, string][] = [["Origin", ORIGIN_VIEWS[provenance.origin].label]];
  if (provenance.provider !== undefined) {
    items.push(["Provider", provenance.provider]);
  }
  if (provenance.model !== undefined) {
    items.push(["Model", provenance.model]);
  }
  items.push(["Review", REVIEW_LABELS[provenance.reviewState]]);
  if (provenance.reviewer !== undefined) {
    items.push(["Reviewer", provenance.reviewer]);
  }
  return items;
}

export function provenanceSummaryText(summary: ProvenanceSummary | undefined): string {
  if (summary === undefined) {
    return "Unavailable";
  }
  const parts = ORIGIN_ORDER.filter((origin) => summary.byOrigin[origin] > 0).map(
    (origin) => `${summary.byOrigin[origin]} ${ORIGIN_VIEWS[origin].label.toLowerCase()}`,
  );
  return parts.length === 0 ? "No values" : parts.join(", ");
}

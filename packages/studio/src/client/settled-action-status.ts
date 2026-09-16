import type { IntegrityGateReason } from "@verbatra/sdk";

export type SettledActionOutcome =
  | { readonly kind: "success" }
  | {
      readonly kind: "rejected";
      readonly reason: IntegrityGateReason;
      readonly details?: readonly string[];
    }
  | { readonly kind: "error"; readonly message: string };

const REJECTION_LABEL: Readonly<Record<IntegrityGateReason, string>> = {
  placeholder: "Rejected: placeholder mismatch",
  markup: "Rejected: inline markup mismatch",
  icu: "Rejected: invalid message syntax",
  degenerate: "Rejected: degenerate translation",
  empty: "Rejected: empty translation",
};

export function settledActionStatusLabel(
  outcome: SettledActionOutcome,
  successLabel: string,
): string {
  if (outcome.kind === "success") {
    return successLabel;
  }
  if (outcome.kind === "rejected") {
    const label = REJECTION_LABEL[outcome.reason];
    const details = outcome.details ?? [];
    return details.length === 0 ? label : `${label} (${details.join(" ")})`;
  }
  return `Failed: ${outcome.message}`;
}

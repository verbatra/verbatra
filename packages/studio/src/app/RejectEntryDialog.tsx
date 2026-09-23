import type { ReactNode } from "react";
import { useState } from "react";
import {
  deriveReviewDecisionOutcome,
  type ReviewDecisionOutcome,
} from "../client/review-decision-outcome.js";
import { rpcClient } from "./api.js";
import { Button } from "./Button.js";
import { actionStatusTextClassName } from "./lib/action-status-classes.js";
import { DrawerShell, Section } from "./ui.js";
import { useDialogA11y } from "./use-dialog-a11y.js";

type RejectState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | {
      readonly kind: "failed";
      readonly outcome: Extract<ReviewDecisionOutcome, { kind: "error" }>;
    };

export interface RejectEntryDialogProps {
  readonly locale: string;
  readonly keyName: string;
  readonly value: string;
  readonly onClose: () => void;
  readonly onRejected: () => void;
}

export function RejectEntryDialog({
  locale,
  keyName,
  value,
  onClose,
  onRejected,
}: RejectEntryDialogProps): ReactNode {
  const [state, setState] = useState<RejectState>({ kind: "idle" });
  const containerRef = useDialogA11y<HTMLDivElement>({ isOpen: true, onClose });

  async function handleReject(): Promise<void> {
    setState({ kind: "submitting" });
    const response = await rpcClient.call("review.reject", {
      locale,
      key: keyName,
      expectedValue: value,
    });
    const outcome = deriveReviewDecisionOutcome(response);
    if (outcome.kind === "success") {
      onRejected();
      return;
    }
    setState({ kind: "failed", outcome });
  }

  return (
    <DrawerShell
      kicker="Reject translation"
      title={
        <>
          {keyName} <span className="text-sm text-muted-foreground">({locale})</span>
        </>
      }
      ariaLabel={`Reject ${keyName} in ${locale}`}
      closeLabel={`Keep ${keyName} and close`}
      onClose={onClose}
      containerRef={containerRef}
    >
      <Section title="Translation to reject">
        <p className="m-0 whitespace-pre-wrap break-words font-mono text-sm text-foreground">
          {value}
        </p>
      </Section>
      <Section title="What happens">
        <ul className="m-0 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
          <li>The translation is removed from the {locale} locale file.</li>
          <li>
            The key counts as missing until the next <code>verbatra translate</code> run, or
            Translate pending, fills it again, or someone writes a new value.
          </li>
          <li>
            The rejection is saved to <code>verbatra.provenance.json</code>. Commit it with the
            locale file and the lock file to share it.
          </li>
        </ul>
      </Section>
      <span className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={state.kind === "submitting"}
          onClick={() => void handleReject()}
        >
          Reject and remove
        </Button>
        <Button size="md" disabled={state.kind === "submitting"} onClick={onClose}>
          Cancel
        </Button>
        {state.kind === "submitting" ? (
          <span className={actionStatusTextClassName(undefined)}>Rejecting…</span>
        ) : null}
        {state.kind === "failed" ? (
          <span className={actionStatusTextClassName("failure")} role="alert">
            Failed: {state.outcome.message}
          </span>
        ) : null}
      </span>
    </DrawerShell>
  );
}

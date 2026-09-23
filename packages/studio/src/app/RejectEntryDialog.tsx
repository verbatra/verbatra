import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  deriveReviewDecisionOutcome,
  isStaleValueOutcome,
  type ReviewDecisionOutcome,
} from "../client/review-decision-outcome.js";
import { rpcClient } from "./api.js";
import { Button } from "./Button.js";
import { actionStatusTextClassName } from "./lib/action-status-classes.js";
import { cn } from "./lib/cn.js";
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
  readonly onValueChanged: (message: string) => void;
}

const STATUS_FOCUS_CLASSNAME =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function isRestoreFailure(state: RejectState): boolean {
  return state.kind === "failed" && state.outcome.code === "REVIEW_RESTORE_FAILED";
}

function RejectStatus({
  state,
  statusRef,
}: {
  readonly state: RejectState;
  readonly statusRef: RefObject<HTMLSpanElement | null>;
}): ReactNode {
  if (state.kind === "submitting") {
    return (
      <span
        ref={statusRef}
        tabIndex={-1}
        className={cn(STATUS_FOCUS_CLASSNAME, actionStatusTextClassName(undefined))}
        role="status"
      >
        Rejecting…
      </span>
    );
  }
  if (state.kind === "failed") {
    return (
      <span
        ref={statusRef}
        tabIndex={-1}
        className={cn(STATUS_FOCUS_CLASSNAME, actionStatusTextClassName("failure"))}
        role="alert"
      >
        {isRestoreFailure(state) ? state.outcome.message : `Failed: ${state.outcome.message}`}
      </span>
    );
  }
  return null;
}

function RejectActions({
  state,
  onReject,
  onClose,
  statusRef,
}: {
  readonly state: RejectState;
  readonly onReject: () => void;
  readonly onClose: () => void;
  readonly statusRef: RefObject<HTMLSpanElement | null>;
}): ReactNode {
  const submitting = state.kind === "submitting";
  const restoreFailed = isRestoreFailure(state);
  return (
    <span className="flex flex-wrap items-center gap-3">
      {restoreFailed ? null : (
        <Button variant="danger" size="md" disabled={submitting} onClick={onReject}>
          Reject and remove
        </Button>
      )}
      <Button size="md" disabled={submitting} onClick={onClose}>
        {restoreFailed ? "Close" : "Cancel"}
      </Button>
      <RejectStatus state={state} statusRef={statusRef} />
    </span>
  );
}

export function RejectEntryDialog({
  locale,
  keyName,
  value,
  onClose,
  onRejected,
  onValueChanged,
}: RejectEntryDialogProps): ReactNode {
  const [state, setState] = useState<RejectState>({ kind: "idle" });
  const closeUnlessSubmitting = (): void => {
    if (state.kind !== "submitting") {
      onClose();
    }
  };
  const rejected = useRef(false);
  const containerRef = useDialogA11y<HTMLDivElement>({
    isOpen: true,
    onClose: closeUnlessSubmitting,
    shouldRestoreFocus: () => !rejected.current,
  });
  const statusRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (state.kind !== "idle") {
      statusRef.current?.focus();
    }
  }, [state]);

  async function handleReject(): Promise<void> {
    setState({ kind: "submitting" });
    const response = await rpcClient.call("review.reject", {
      locale,
      key: keyName,
      expectedValue: value,
    });
    const outcome = deriveReviewDecisionOutcome(response);
    if (outcome.kind === "success") {
      rejected.current = true;
      onRejected();
      return;
    }
    if (isStaleValueOutcome(outcome)) {
      onValueChanged(outcome.message);
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
      onClose={closeUnlessSubmitting}
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
            The key counts as missing until the next <code>verbatra translate</code> run, or{" "}
            <strong>Translate pending changes across all locales</strong>, fills it again, or
            someone writes a new value.
          </li>
          <li>
            The rejection is saved to <code>verbatra.provenance.json</code>. Commit it with the
            locale file and the lock file to share it.
          </li>
        </ul>
      </Section>
      <RejectActions
        state={state}
        onReject={() => void handleReject()}
        onClose={onClose}
        statusRef={statusRef}
      />
    </DrawerShell>
  );
}

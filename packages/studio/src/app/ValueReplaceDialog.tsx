import { DrawerShell, useDialogA11y } from "@verbatra/ui";
import type { ReactNode } from "react";
import { ReplaceCriteriaStep } from "./ReplaceCriteriaStep.js";
import { ReplaceResultStep } from "./ReplaceResultStep.js";
import { ReplaceReviewStep } from "./ReplaceReviewStep.js";
import { useValueReplace } from "./use-value-replace.js";

const STEP_TITLE = {
  criteria: "Search and replace",
  review: "Review the matches",
  result: "Result",
} as const;

export function ValueReplaceDialog({
  locales,
  onClose,
}: {
  readonly locales: readonly string[];
  readonly onClose: () => void;
}): ReactNode {
  const flow = useValueReplace(locales);
  const { phase } = flow;
  const busy =
    (phase.kind === "criteria" && phase.busy) || (phase.kind === "review" && phase.applying);
  const closeUnlessBusy = (): void => {
    if (!busy) {
      onClose();
    }
  };
  const containerRef = useDialogA11y<HTMLDivElement>({ isOpen: true, onClose: closeUnlessBusy });
  const title = STEP_TITLE[phase.kind];
  return (
    <DrawerShell
      title={title}
      ariaLabel={title}
      closeLabel="Close search and replace"
      onClose={closeUnlessBusy}
      containerRef={containerRef}
      size="wide"
    >
      {phase.kind === "criteria" ? (
        <ReplaceCriteriaStep
          key="criteria"
          allLocales={locales}
          busy={phase.busy}
          error={phase.error}
          initial={flow.lastCriteria}
          onPreview={flow.runPreview}
          onClose={onClose}
        />
      ) : null}
      {phase.kind === "review" ? (
        <ReplaceReviewStep
          preview={phase.preview}
          optIns={phase.optIns}
          applying={phase.applying}
          error={phase.error}
          onOptIn={flow.setOptIn}
          onApply={flow.apply}
          onBack={flow.backToCriteria}
        />
      ) : null}
      {phase.kind === "result" ? (
        <ReplaceResultStep
          result={phase.result}
          onSearchAgain={flow.backToCriteria}
          onClose={onClose}
        />
      ) : null}
    </DrawerShell>
  );
}

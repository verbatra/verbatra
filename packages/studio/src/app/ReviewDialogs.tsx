import type { ReactNode } from "react";
import type { ReviewQueueRow } from "../client/review-queue-data.js";
import { BulkRejectDialog, type BulkRejectEntry } from "./BulkRejectDialog.js";
import { EditEntryDialog } from "./EditEntryDialog.js";
import { RejectEntryDialog } from "./RejectEntryDialog.js";
import { ReviewShortcutsDialog } from "./ReviewShortcutsDialog.js";
import type { ReviewDecisions } from "./use-review-decisions.js";

export interface EditingTarget {
  readonly locale: string;
  readonly key: string;
  readonly reasons: ReviewQueueRow["reasons"];
  readonly viaShortcut: boolean;
}

export interface RejectingTarget {
  readonly locale: string;
  readonly key: string;
  readonly value: string;
}

export function ReviewDialogs({
  helpOpen,
  spend,
  editing,
  rejecting,
  decisions,
  onCloseHelp,
  onCloseEditor,
  onCloseReject,
  bulkRejecting,
  onConfirmBulkReject,
  onCloseBulkReject,
}: {
  readonly helpOpen: boolean;
  readonly spend: boolean;
  readonly editing: EditingTarget | null;
  readonly rejecting: RejectingTarget | null;
  readonly decisions: ReviewDecisions;
  readonly onCloseHelp: () => void;
  readonly onCloseEditor: () => void;
  readonly onCloseReject: () => void;
  readonly bulkRejecting: readonly BulkRejectEntry[] | null;
  readonly onConfirmBulkReject: (entries: readonly BulkRejectEntry[]) => void;
  readonly onCloseBulkReject: () => void;
}): ReactNode {
  return (
    <>
      {bulkRejecting !== null ? (
        <BulkRejectDialog
          entries={bulkRejecting}
          onConfirm={() => onConfirmBulkReject(bulkRejecting)}
          onClose={onCloseBulkReject}
        />
      ) : null}
      {helpOpen ? <ReviewShortcutsDialog spend={spend} onClose={onCloseHelp} /> : null}
      {editing !== null ? (
        <EditEntryDialog
          locale={editing.locale}
          keyName={editing.key}
          focusTranslation={editing.viaShortcut}
          reviewReasons={editing.reasons}
          onClose={onCloseEditor}
          onAccepted={(acceptedLocale, key) => {
            decisions.updated({ locale: acceptedLocale, key });
            onCloseEditor();
          }}
        />
      ) : null}
      {rejecting !== null ? (
        <RejectEntryDialog
          locale={rejecting.locale}
          keyName={rejecting.key}
          value={rejecting.value}
          onClose={onCloseReject}
          onRejected={() => {
            decisions.rejected(rejecting);
            onCloseReject();
          }}
          onValueChanged={(message) => {
            decisions.rejectStale({ locale: rejecting.locale, key: rejecting.key }, message);
            onCloseReject();
          }}
        />
      ) : null}
    </>
  );
}

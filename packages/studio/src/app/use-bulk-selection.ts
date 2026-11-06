import { useState } from "react";
import type { KeyValuePair } from "../client/filter.js";
import type { RowBusyAction } from "../client/review-in-flight.js";
import { type ReviewQueueRow, reviewedValueFor } from "../client/review-queue-data.js";
import {
  bulkBusyNote,
  bulkDecisionBlocker,
  bulkRetranslateBlocker,
  type SelectionState,
  selectedAmong,
  selectionState,
  toggleSelected,
  withAllSelected,
} from "../client/review-selection.js";
import { MAX_RETRANSLATE_BATCH_ENTRIES } from "../shared/rpc/retranslate-entries.js";
import { MAX_REVIEW_BATCH_ENTRIES } from "../shared/rpc/review-batch.js";
import type { BulkRejectEntry } from "./BulkRejectDialog.js";
import type { ReviewBulkBarProps } from "./ReviewBulkBar.js";
import { type BatchSettled, type ReviewDecisions, rowId } from "./use-review-decisions.js";

export interface BulkSelection {
  readonly selected: ReadonlySet<string>;
  readonly state: SelectionState;
  readonly toggle: (row: ReviewQueueRow) => void;
  readonly setAll: (on: boolean) => void;
  readonly bar: ReviewBulkBarProps;
  readonly rejecting: readonly BulkRejectEntry[] | null;
  readonly confirmReject: (entries: readonly BulkRejectEntry[]) => void;
  readonly closeReject: () => void;
}

function bulkTargetsOf(
  rows: readonly ReviewQueueRow[],
  values: ReadonlyMap<string, KeyValuePair>,
): readonly BulkRejectEntry[] {
  return rows.flatMap((row) => {
    const value = reviewedValueFor(values, row);
    return value === undefined ? [] : [{ locale: row.locale, key: row.key, value }];
  });
}

export function useBulkSelection(
  rows: readonly ReviewQueueRow[],
  values: ReadonlyMap<string, KeyValuePair>,
  decisions: ReviewDecisions,
  spend: boolean,
  onCleared: () => void,
): BulkSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState<readonly BulkRejectEntry[] | null>(null);
  const [running, setRunning] = useState<RowBusyAction | undefined>(undefined);
  const ids = rows.map(rowId);
  const selectedIds = new Set(selectedAmong(ids, selected));
  const selectedRows = rows.filter((row) => selectedIds.has(rowId(row)));
  const actionableRows = selectedRows.filter((row) => !decisions.pending.has(rowId(row)));
  const targets = bulkTargetsOf(actionableRows, values);
  const keepFailures: BatchSettled = (failed) => {
    setRunning(undefined);
    setSelected((current) => new Set([...current].filter((id) => failed.has(id))));
  };
  return {
    selected,
    state: selectionState(ids, selected),
    toggle: (row) => setSelected((current) => toggleSelected(current, rowId(row))),
    setAll: (on) => setSelected((current) => withAllSelected(current, ids, on)),
    bar: {
      count: selectedRows.length,
      actionable: actionableRows.length,
      busyAction: running,
      busyNote:
        running === undefined ? bulkBusyNote(selectedRows.length - actionableRows.length) : null,
      decisionBlocker: bulkDecisionBlocker(
        actionableRows.length,
        targets.length,
        MAX_REVIEW_BATCH_ENTRIES,
      ),
      retranslateBlocker: bulkRetranslateBlocker(
        actionableRows.length,
        MAX_RETRANSLATE_BATCH_ENTRIES,
      ),
      onApprove: () => {
        setRunning("approve");
        decisions.approveMany(targets, keepFailures);
      },
      onReject: () => setRejecting(targets),
      onRetranslate: spend
        ? () => {
            setRunning("retranslate");
            decisions.retranslateMany(actionableRows, keepFailures);
          }
        : undefined,
      onClear: () => {
        setSelected(new Set());
        onCleared();
      },
    },
    rejecting,
    confirmReject: (entries) => {
      setRunning("reject");
      decisions.rejectMany(entries, keepFailures);
      setRejecting(null);
    },
    closeReject: () => setRejecting(null),
  };
}

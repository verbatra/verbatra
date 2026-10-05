import type { MachineClassOrigin } from "@verbatra/sdk";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { budgetRefusal } from "../client/rate-budget.js";
import {
  deriveRetranslateOutcome,
  isProtectedRefusal,
  type RetranslateOutcome,
} from "../client/retranslate-outcome.js";
import {
  type BatchAction,
  type BatchSummary,
  failedBatchEntryIds,
  summarizeRetranslateBatch,
  summarizeReviewBatch,
} from "../client/review-batch-outcome.js";
import {
  deriveReviewDecisionOutcome,
  isStaleValueOutcome,
} from "../client/review-decision-outcome.js";
import {
  mergeServerInFlight,
  type PendingRow,
  type RowBusyAction,
} from "../client/review-in-flight.js";
import { orNetworkFailure } from "../client/rpc-client.js";
import { settledActionStatusLabel } from "../client/settled-action-status.js";
import type { StudioRateLimits } from "../shared/rpc/snapshot.js";
import { rateBudget, rpcClient } from "./api.js";
import type { DecisionNotice } from "./ReviewDecisionStatus.js";

export interface EntryRef {
  readonly locale: string;
  readonly key: string;
}

export interface ValuedEntry extends EntryRef {
  readonly value: string;
}

export function rowId(row: EntryRef): string {
  return `${row.locale}\u0000${row.key}`;
}

export const IN_FLIGHT_POLL_MS = 2_000;

const ALREADY_IN_PROGRESS = "ALREADY_IN_PROGRESS";

const PROTECTED_RETRANSLATE_MESSAGE =
  "a person wrote this value. Open the key on the Translations page to replace it anyway.";

function retranslateFailure(protectedValue: boolean, outcome: RetranslateOutcome): string {
  if (protectedValue) {
    return PROTECTED_RETRANSLATE_MESSAGE;
  }
  return outcome.kind === "error" ? outcome.message : settledActionStatusLabel(outcome, "");
}

export type BatchSettled = (failedIds: ReadonlySet<string>) => void;

export interface ReviewDecisions {
  readonly pending: ReadonlyMap<string, PendingRow>;
  readonly notice: DecisionNotice | null;
  readonly settledCount: number;
  readonly approve: (row: EntryRef, value: string) => void;
  readonly retranslate: (row: EntryRef) => void;
  readonly approveMany: (targets: readonly ValuedEntry[], onSettled: BatchSettled) => void;
  readonly approveLocale: (
    locale: string,
    origins: readonly MachineClassOrigin[] | undefined,
    onSettled: () => void,
  ) => void;
  readonly rejectMany: (targets: readonly ValuedEntry[], onSettled: BatchSettled) => void;
  readonly retranslateMany: (rows: readonly EntryRef[], onSettled: BatchSettled) => void;
  readonly rejected: (target: EntryRef) => void;
  readonly rejectStale: (target: EntryRef, message: string) => void;
  readonly updated: (target: EntryRef) => void;
  readonly reloaded: () => void;
  readonly awaitingReload: () => boolean;
}

function withRows(
  current: ReadonlyMap<string, PendingRow>,
  rows: readonly EntryRef[],
  action: RowBusyAction | undefined,
): ReadonlyMap<string, PendingRow> {
  const next = new Map(current);
  const startedAt = Date.now();
  for (const row of rows) {
    if (action === undefined) {
      next.delete(rowId(row));
    } else {
      next.set(rowId(row), { action, startedAt, tracked: "local" });
    }
  }
  return next;
}

function useServerInFlight(
  enabled: boolean,
  refreshToken: number,
  pendingRef: { readonly current: ReadonlyMap<string, PendingRow> },
  setPending: (
    next: (current: ReadonlyMap<string, PendingRow>) => ReadonlyMap<string, PendingRow>,
  ) => void,
  onFinished: () => void,
): () => void {
  const [pollTick, setPollTick] = useState(0);
  const onFinishedRef = useRef(onFinished);
  useLayoutEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    void rpcClient.call("translation.inFlight", {}).then((response) => {
      if (cancelled || !response.ok) {
        return;
      }
      const running = response.result.retranslating;
      const now = Date.now();
      const merge = mergeServerInFlight(pendingRef.current, running, now, rowId);
      setPending((current) => mergeServerInFlight(current, running, now, rowId).next);
      if (merge.finished.length > 0) {
        onFinishedRef.current();
      }
      if (merge.serverTracked > 0) {
        timer = window.setTimeout(() => setPollTick((tick) => tick + 1), IN_FLIGHT_POLL_MS);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, refreshToken, pollTick, pendingRef, setPending]);

  return useCallback(() => setPollTick((tick) => tick + 1), []);
}

export function useReviewDecisions(
  onDecided: () => void,
  options: {
    readonly trackServer: boolean;
    readonly refreshToken: number;
    readonly limits?: StudioRateLimits | undefined;
  },
): ReviewDecisions {
  const [pending, setPendingState] = useState<ReadonlyMap<string, PendingRow>>(new Map());
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  });
  const awaitingReload = useRef<Set<string>>(new Set());
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const [settledCount, setSettledCount] = useState(0);
  const setPending = useCallback(
    (next: (current: ReadonlyMap<string, PendingRow>) => ReadonlyMap<string, PendingRow>) =>
      setPendingState(next),
    [],
  );
  const pollNow = useServerInFlight(
    options.trackServer,
    options.refreshToken,
    pendingRef,
    setPending,
    onDecided,
  );

  function settle(next: DecisionNotice): void {
    setNotice(next);
    setSettledCount((count) => count + 1);
  }

  function setRowsPending(rows: readonly EntryRef[], action: RowBusyAction | undefined): void {
    setPending((current) => withRows(current, rows, action));
  }

  function reloadThenSettle(rows: readonly EntryRef[]): void {
    for (const row of rows) {
      awaitingReload.current.add(rowId(row));
    }
    onDecided();
  }

  function settleBatch(
    rows: readonly EntryRef[],
    summary: BatchSummary,
    onSettled: BatchSettled,
  ): void {
    settle({ kind: "batch", summary });
    onSettled(failedBatchEntryIds(summary, rows.map(rowId), rowId));
    if (summary.kind === "error") {
      setRowsPending(rows, undefined);
      return;
    }
    reloadThenSettle(rows);
  }

  function refusedByBudget(
    method: string,
    params: unknown,
    action: BatchAction,
    rows: readonly EntryRef[],
    onSettled: BatchSettled,
  ): boolean {
    const refusal = budgetRefusal(rateBudget.check(method, params, options.limits, Date.now()));
    if (refusal === undefined) {
      return false;
    }
    settleBatch(rows, { kind: "error", action, message: refusal }, onSettled);
    return true;
  }

  async function decideMany(
    action: "approve" | "reject",
    targets: readonly ValuedEntry[],
    onSettled: BatchSettled,
  ): Promise<void> {
    const method = action === "approve" ? "review.approveMany" : "review.rejectMany";
    const params = {
      entries: targets.map(({ locale, key, value }) => ({ locale, key, expectedValue: value })),
    };
    if (refusedByBudget(method, params, action, targets, onSettled)) {
      return;
    }
    setRowsPending(targets, action);
    const response = await orNetworkFailure(rpcClient.call(method, params));
    settleBatch(targets, summarizeReviewBatch(action, response), onSettled);
  }

  async function approveLocale(
    locale: string,
    origins: readonly MachineClassOrigin[] | undefined,
    onSettled: () => void,
  ): Promise<void> {
    const response = await orNetworkFailure(
      rpcClient.call("review.approveLocale", {
        locale,
        ...(origins !== undefined ? { origins: [...origins] } : {}),
      }),
    );
    onSettled();
    if (!response.ok) {
      settle({ kind: "locale-failed", locale, message: response.error.message });
      return;
    }
    settle({
      kind: "locale-approved",
      locale,
      approved: response.result.approved.length,
      sourceChanged: response.result.sourceChanged.length,
    });
    onDecided();
  }

  async function retranslateMany(
    rows: readonly EntryRef[],
    onSettled: BatchSettled,
  ): Promise<void> {
    const method = "translation.retranslateEntries";
    const params = { entries: rows.map(({ locale, key }) => ({ locale, key })) };
    if (refusedByBudget(method, params, "retranslate", rows, onSettled)) {
      return;
    }
    setRowsPending(rows, "retranslate");
    const response = await orNetworkFailure(rpcClient.call(method, params));
    settleBatch(rows, summarizeRetranslateBatch(response), onSettled);
  }

  async function approve(row: EntryRef, value: string): Promise<void> {
    setRowsPending([row], "approve");
    const response = await orNetworkFailure(
      rpcClient.call("review.approve", { locale: row.locale, key: row.key, expectedValue: value }),
    );
    const outcome = deriveReviewDecisionOutcome(response);
    settle(
      outcome.kind === "success"
        ? { kind: "approved", locale: row.locale, key: row.key }
        : { kind: "failed", action: "approve", ...row, message: outcome.message },
    );
    if (outcome.kind === "success" || isStaleValueOutcome(outcome)) {
      reloadThenSettle([row]);
    } else {
      setRowsPending([row], undefined);
    }
  }

  async function retranslate(row: EntryRef): Promise<void> {
    setRowsPending([row], "retranslate");
    const response = await orNetworkFailure(
      rpcClient.call("translation.retranslateEntry", { locale: row.locale, key: row.key }),
    );
    if (!response.ok && response.error.code === ALREADY_IN_PROGRESS) {
      setPending((current) =>
        new Map(current).set(rowId(row), {
          action: "retranslate",
          startedAt: current.get(rowId(row))?.startedAt ?? Date.now(),
          tracked: "server",
        }),
      );
      setNotice({ kind: "already-running", locale: row.locale, key: row.key });
      pollNow();
      return;
    }
    const outcome = deriveRetranslateOutcome(response);
    if (outcome.kind === "success") {
      settle({ kind: "retranslated", locale: row.locale, key: row.key });
      reloadThenSettle([row]);
      return;
    }
    settle({
      kind: "failed",
      action: "retranslate",
      ...row,
      message: retranslateFailure(isProtectedRefusal(response), outcome),
    });
    setRowsPending([row], undefined);
  }

  const reloaded = useCallback((): void => {
    const settled = awaitingReload.current;
    if (settled.size === 0) {
      return;
    }
    awaitingReload.current = new Set();
    setPending((current) => {
      const next = new Map(current);
      for (const id of settled) {
        next.delete(id);
      }
      return next;
    });
  }, [setPending]);

  return {
    pending,
    notice,
    settledCount,
    approve: (row, value) => void approve(row, value),
    retranslate: (row) => void retranslate(row),
    approveMany: (targets, onSettled) => void decideMany("approve", targets, onSettled),
    approveLocale: (locale, origins, onSettled) => void approveLocale(locale, origins, onSettled),
    rejectMany: (targets, onSettled) => void decideMany("reject", targets, onSettled),
    retranslateMany: (rows, onSettled) => void retranslateMany(rows, onSettled),
    rejected: (target) => {
      settle({ kind: "rejected", locale: target.locale, key: target.key });
      reloadThenSettle([target]);
    },
    rejectStale: (target, message) => {
      settle({ kind: "failed", action: "reject", ...target, message });
      onDecided();
    },
    updated: (target) => {
      settle({ kind: "updated", locale: target.locale, key: target.key });
      onDecided();
    },
    reloaded,
    awaitingReload: () => awaitingReload.current.size > 0,
  };
}

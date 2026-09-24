export type RowBusyAction = "approve" | "reject" | "retranslate";

export interface PendingRow {
  readonly action: RowBusyAction;
  readonly startedAt: number;
  readonly tracked: "local" | "server";
}

export interface RunningEntry {
  readonly locale: string;
  readonly key: string;
  readonly elapsedMs: number;
}

export interface InFlightMerge {
  readonly next: ReadonlyMap<string, PendingRow>;
  readonly finished: readonly string[];
  readonly serverTracked: number;
}

export function mergeServerInFlight(
  current: ReadonlyMap<string, PendingRow>,
  running: readonly RunningEntry[],
  now: number,
  idOf: (entry: { readonly locale: string; readonly key: string }) => string,
): InFlightMerge {
  const next = new Map(current);
  const runningIds = new Set(running.map(idOf));
  const finished: string[] = [];
  for (const [id, row] of current) {
    if (row.tracked === "server" && !runningIds.has(id)) {
      next.delete(id);
      finished.push(id);
    }
  }
  for (const entry of running) {
    const id = idOf(entry);
    if (!next.has(id)) {
      next.set(id, { action: "retranslate", startedAt: now - entry.elapsedMs, tracked: "server" });
    }
  }
  const serverTracked = [...next.values()].filter((row) => row.tracked === "server").length;
  return { next, finished, serverTracked };
}

export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function hasRunningRetranslation(pending: ReadonlyMap<string, PendingRow>): boolean {
  return [...pending.values()].some((row) => row.action === "retranslate");
}

const BUSY_LABELS: Readonly<Record<RowBusyAction, string>> = {
  approve: "Approving…",
  reject: "Rejecting…",
  retranslate: "Retranslating…",
};

export function rowBusyLabel(action: RowBusyAction): string {
  return BUSY_LABELS[action];
}

export function rowBusyStatus(action: RowBusyAction, seconds: number | undefined): string {
  return seconds === undefined
    ? BUSY_LABELS[action]
    : `${BUSY_LABELS[action]} ${seconds} ${seconds === 1 ? "second" : "seconds"} so far`;
}

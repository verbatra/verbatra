import type { ProgressEvent, ProgressListener } from "@verbatra/sdk";

export type BudgetStop = "rate-limited" | "attempt-cap" | "locale-incomplete";

export interface Budget {
  readonly controller: AbortController;
  readonly onProgress: ProgressListener;
  attempts(): number;
  stopReason(): BudgetStop | undefined;
}

export const ATTEMPTS_PER_EVENT: Readonly<Partial<Record<ProgressEvent["type"], number>>> = {
  "sub-batch": 1,
  repair: 1,
  "provider-retry": 1,
  "split-retry": 2,
};

export function createBudget(cap: number): Budget {
  const controller = new AbortController();
  let attempts = 0;
  let reason: BudgetStop | undefined;
  const stop = (why: BudgetStop): void => {
    reason ??= why;
    controller.abort(new Error(`playground budget stop: ${why}`));
  };
  const onProgress: ProgressListener = (event) => {
    if (event.type === "locale-finished" && event.status !== "succeeded") {
      stop("locale-incomplete");
      return;
    }
    const weight = ATTEMPTS_PER_EVENT[event.type];
    if (weight === undefined) {
      return;
    }
    attempts += weight;
    if (event.type === "provider-retry" && event.status === 429) {
      stop("rate-limited");
    } else if (attempts > cap) {
      stop("attempt-cap");
    }
  };
  return {
    controller,
    onProgress,
    attempts: () => attempts,
    stopReason: () => reason,
  };
}

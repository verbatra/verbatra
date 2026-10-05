import { type SpinnerClock, systemClock } from "./spinner.js";

export type LockReleaseOutcome =
  | { readonly status: "released" }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "timed-out"; readonly deadlineMs: number };

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function releaseLocksWithin(
  release: () => Promise<void>,
  deadlineMs: number,
  clock: Pick<SpinnerClock, "setTimeout" | "clearTimeout"> = systemClock,
): Promise<LockReleaseOutcome> {
  return new Promise((resolve) => {
    const timer = clock.setTimeout(() => resolve({ status: "timed-out", deadlineMs }), deadlineMs);
    const settle = (outcome: LockReleaseOutcome): void => {
      clock.clearTimeout(timer);
      resolve(outcome);
    };
    release().then(
      () => settle({ status: "released" }),
      (error: unknown) => settle({ status: "failed", message: failureMessage(error) }),
    );
  });
}

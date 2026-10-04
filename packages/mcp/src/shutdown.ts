import type { McpStopCause } from "./session-banner.js";

export type ShutdownSignal = "SIGINT" | "SIGTERM";

export const GRACEFUL_CLOSE_DEADLINE_MS = 2_000;

export const RELEASE_LOCKS_DEADLINE_MS = 5_000;

const FORCED_EXIT_CODES: Readonly<Record<ShutdownSignal, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
};

export interface ShutdownDeps {
  close(): Promise<void>;
  releaseLocks(): Promise<void>;
  exit(code: number): void;
  onStopped(cause: McpStopCause): void;
  startDeadline(onElapsed: () => void, ms: number): void;
  readonly deadlineMs?: number;
  readonly releaseDeadlineMs?: number;
}

export interface ShutdownController {
  onSignal(signal: ShutdownSignal): void;
  onClosed(): void;
}

export function createShutdown(deps: ShutdownDeps): ShutdownController {
  let stopping = false;
  let finished = false;
  let exited = false;

  const exitOnce = (code: number): void => {
    if (!exited) {
      exited = true;
      deps.exit(code);
    }
  };

  const finish = (code: number, cause: McpStopCause | undefined): void => {
    if (finished) {
      return;
    }
    finished = true;
    if (cause !== undefined) {
      deps.onStopped(cause);
    }
    deps.startDeadline(() => exitOnce(code), deps.releaseDeadlineMs ?? RELEASE_LOCKS_DEADLINE_MS);
    void deps
      .releaseLocks()
      .catch(() => undefined)
      .finally(() => exitOnce(code));
  };

  return {
    onSignal(signal) {
      if (stopping) {
        finish(FORCED_EXIT_CODES[signal], undefined);
        return;
      }
      stopping = true;
      deps.startDeadline(() => finish(0, "signal"), deps.deadlineMs ?? GRACEFUL_CLOSE_DEADLINE_MS);
      void deps
        .close()
        .catch(() => undefined)
        .finally(() => finish(0, "signal"));
    },
    onClosed() {
      finish(0, stopping ? "signal" : "stdin-closed");
    },
  };
}

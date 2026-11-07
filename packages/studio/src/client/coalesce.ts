export interface CoalescedRunner {
  readonly trigger: () => void;
}

export function createCoalescedRunner(run: () => Promise<void>): CoalescedRunner {
  let running = false;
  let pending = false;

  async function drain(): Promise<void> {
    running = true;
    do {
      pending = false;
      await run().catch(() => undefined);
    } while (pending);
    running = false;
  }

  return {
    trigger(): void {
      if (running) {
        pending = true;
        return;
      }
      void drain();
    },
  };
}

export interface PacedRunner {
  readonly trigger: (options?: { readonly immediate?: boolean }) => void;
  readonly cancel: () => void;
}

export interface PacedRunnerOptions {
  readonly minGapMs: number;
  readonly now?: () => number;
}

export function createPacedRunner(
  run: () => Promise<void>,
  options: PacedRunnerOptions,
): PacedRunner {
  const now = options.now ?? Date.now;
  let running = false;
  let pending: "none" | "paced" | "immediate" = "none";
  let lastStart = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  function clear(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  async function start(): Promise<void> {
    clear();
    pending = "none";
    running = true;
    lastStart = now();
    await run().catch(() => undefined);
    running = false;
    if (!cancelled && pending !== "none") {
      schedule(pending === "immediate");
    }
  }

  function schedule(immediate: boolean): void {
    if (cancelled) {
      return;
    }
    if (running) {
      pending = immediate || pending === "immediate" ? "immediate" : "paced";
      return;
    }
    const wait = immediate ? 0 : Math.max(0, lastStart + options.minGapMs - now());
    if (wait === 0) {
      void start();
      return;
    }
    if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        void start();
      }, wait);
    }
  }

  return {
    trigger(triggerOptions) {
      schedule(triggerOptions?.immediate === true);
    },
    cancel() {
      cancelled = true;
      clear();
    },
  };
}

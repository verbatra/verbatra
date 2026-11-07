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

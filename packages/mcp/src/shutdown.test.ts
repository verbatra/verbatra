import { describe, expect, it, vi } from "vitest";
import {
  createShutdown,
  GRACEFUL_CLOSE_DEADLINE_MS,
  RELEASE_LOCKS_DEADLINE_MS,
  type ShutdownDeps,
} from "./shutdown.js";

interface Harness {
  readonly deps: ShutdownDeps;
  readonly events: string[];
  readonly settleClose: () => void;
  readonly elapseDeadline: () => void;
  readonly deadlines: number[];
}

interface HarnessOptions {
  readonly closeRejects?: boolean;
  readonly releaseRejects?: boolean;
  readonly releaseHangs?: boolean;
}

function harness(options: HarnessOptions = {}): Harness {
  const events: string[] = [];
  const deadlines: number[] = [];
  let settleClose = (): void => undefined;
  let elapseDeadline = (): void => undefined;
  const deps: ShutdownDeps = {
    close: () =>
      new Promise<void>((resolve, reject) => {
        events.push("close");
        settleClose = () => (options.closeRejects === true ? reject(new Error("boom")) : resolve());
      }),
    releaseLocks: async () => {
      events.push("release");
      if (options.releaseHangs === true) {
        await new Promise<never>(() => undefined);
      }
      if (options.releaseRejects === true) {
        throw new Error("unlink failed");
      }
    },
    exit: (code) => {
      events.push(`exit ${code}`);
    },
    onStopped: (cause) => {
      events.push(`stopped ${cause}`);
    },
    startDeadline: (onElapsed, ms) => {
      deadlines.push(ms);
      elapseDeadline = onElapsed;
    },
  };
  return {
    deps,
    events,
    deadlines,
    settleClose: () => settleClose(),
    elapseDeadline: () => elapseDeadline(),
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("createShutdown: first signal", () => {
  it("closes the server, releases held locks, then exits 0 once the close settles", async () => {
    const h = harness();
    const shutdown = createShutdown(h.deps);

    shutdown.onSignal("SIGINT");
    expect(h.events).toEqual(["close"]);
    h.settleClose();
    await flush();

    expect(h.events).toEqual(["close", "stopped signal", "release", "exit 0"]);
  });

  it("arms the default graceful deadline", () => {
    const h = harness();

    createShutdown(h.deps).onSignal("SIGTERM");

    expect(h.deadlines).toEqual([GRACEFUL_CLOSE_DEADLINE_MS]);
  });

  it("uses an injected deadline", () => {
    const h = harness();

    createShutdown({ ...h.deps, deadlineMs: 50 }).onSignal("SIGINT");

    expect(h.deadlines).toEqual([50]);
  });

  it("releases held locks and exits 0 when the close hangs past the deadline", async () => {
    const h = harness();
    const shutdown = createShutdown(h.deps);

    shutdown.onSignal("SIGINT");
    h.elapseDeadline();
    await flush();

    expect(h.events).toEqual(["close", "stopped signal", "release", "exit 0"]);
  });

  it("still exits when the close rejects", async () => {
    const h = harness({ closeRejects: true });
    const shutdown = createShutdown(h.deps);

    shutdown.onSignal("SIGINT");
    h.settleClose();
    await flush();

    expect(h.events).toContain("exit 0");
  });

  it("still exits when releasing the locks fails", async () => {
    const h = harness({ releaseRejects: true });
    const shutdown = createShutdown(h.deps);

    shutdown.onSignal("SIGINT");
    h.settleClose();
    await flush();

    expect(h.events.at(-1)).toBe("exit 0");
  });

  it("exits only once when the close settles and the server reports closed", async () => {
    const h = harness();
    const shutdown = createShutdown(h.deps);

    shutdown.onSignal("SIGINT");
    shutdown.onClosed();
    h.settleClose();
    h.elapseDeadline();
    await flush();

    expect(h.events.filter((event) => event.startsWith("exit"))).toEqual(["exit 0"]);
    expect(h.events).toContain("stopped signal");
  });
});

describe("createShutdown: second signal", () => {
  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)(
    "forces exit %s with %i after releasing held locks, without waiting for the close",
    async (signal, code) => {
      const h = harness();
      const shutdown = createShutdown(h.deps);

      shutdown.onSignal("SIGINT");
      shutdown.onSignal(signal);
      await flush();

      expect(h.events).toEqual(["close", "release", `exit ${code}`]);
    },
  );
});

describe("createShutdown: stdin closed", () => {
  it("reports the client closing stdin, releases held locks, and exits 0", async () => {
    const h = harness();

    createShutdown(h.deps).onClosed();
    await flush();

    expect(h.events).toEqual(["stopped stdin-closed", "release", "exit 0"]);
  });

  it("ignores a signal that arrives after the exit has started", async () => {
    const exit = vi.fn();
    const h = harness();
    const shutdown = createShutdown({ ...h.deps, exit });

    shutdown.onClosed();
    shutdown.onSignal("SIGINT");
    shutdown.onSignal("SIGINT");
    await flush();

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("createShutdown: releasing the locks hangs", () => {
  it("arms the default release deadline once it starts releasing", () => {
    const h = harness();

    createShutdown(h.deps).onClosed();

    expect(h.deadlines).toEqual([RELEASE_LOCKS_DEADLINE_MS]);
  });

  it("uses an injected release deadline", () => {
    const h = harness();

    createShutdown({ ...h.deps, releaseDeadlineMs: 70 }).onClosed();

    expect(h.deadlines).toEqual([70]);
  });

  it("exits 0 once the release deadline elapses", async () => {
    const h = harness({ releaseHangs: true });

    createShutdown(h.deps).onClosed();
    await flush();
    expect(h.events).toEqual(["stopped stdin-closed", "release"]);
    h.elapseDeadline();
    await flush();

    expect(h.events).toEqual(["stopped stdin-closed", "release", "exit 0"]);
  });

  it("exits with the forced code when a second signal's release hangs", async () => {
    const h = harness({ releaseHangs: true });
    const shutdown = createShutdown(h.deps);

    shutdown.onSignal("SIGINT");
    shutdown.onSignal("SIGTERM");
    h.elapseDeadline();
    await flush();

    expect(h.deadlines).toEqual([GRACEFUL_CLOSE_DEADLINE_MS, RELEASE_LOCKS_DEADLINE_MS]);
    expect(h.events).toEqual(["close", "release", "exit 143"]);
  });
});

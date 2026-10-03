import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkError } from "../errors.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import { deferred, makeFakeFs } from "../test-support.js";
import type { LivenessContext } from "./holder-liveness.js";
import {
  isUnreadableLockError,
  type LocaleWriteLockOptions,
  type LockWaitEvent,
  localeLockPath,
  lockFileGuardPath,
  unacquiredLockPath,
  withLocaleWriteLock,
  withLockFileGuard,
} from "./locale-write-lock.js";

function barrier(parties: number): { readonly arrive: () => Promise<void> } {
  const allArrived = deferred();
  let arrived = 0;
  return {
    arrive: (): Promise<void> => {
      arrived += 1;
      if (arrived === parties) {
        allArrived.resolve();
      }
      return allArrived.promise;
    },
  };
}

function refusalWatchingFs(): { readonly fs: SdkFs; readonly refused: Promise<void> } {
  const inner = makeLockFs();
  const refusal = deferred();
  return {
    fs: {
      ...inner,
      createExclusive: async (path, data): Promise<boolean> => {
        const created = await inner.createExclusive(path, data);
        if (!created) {
          refusal.resolve();
        }
        return created;
      },
    },
    refused: refusal.promise,
  };
}

interface HeldSection {
  readonly entered: Promise<void>;
  readonly release: () => void;
  readonly run: () => Promise<void>;
}

function heldSection(
  id: string,
  order: string[],
  tracker: { inside: number; max: number },
): HeldSection {
  const entered = deferred();
  const released = deferred();
  return {
    entered: entered.promise,
    release: released.resolve,
    run: async (): Promise<void> => {
      tracker.inside += 1;
      tracker.max = Math.max(tracker.max, tracker.inside);
      order.push(`${id}-start`);
      entered.resolve();
      await released.promise;
      order.push(`${id}-end`);
      tracker.inside -= 1;
    },
  };
}

function makeLockFs(): SdkFs {
  return makeFakeFs();
}

function scriptedUntilCreated(
  succeeds: () => boolean,
  payload: SdkFs["readFileBounded"],
): Partial<SdkFs> {
  let created: string | undefined;
  return {
    createExclusive: async (_path, data): Promise<boolean> => {
      if (!succeeds()) {
        return false;
      }
      created = data;
      return true;
    },
    readFileBounded: async (path, maxBytes): Promise<BoundedFileRead> =>
      created !== undefined ? { kind: "ok", content: created } : payload(path, maxBytes),
    deleteFile: async (): Promise<void> => {
      created = undefined;
    },
  };
}

describe("localeLockPath", () => {
  it("resolves under .verbatra-local/locks/<locale>.lock", () => {
    const path = localeLockPath("/proj", "de");
    expect(path).toBe(join("/proj", ".verbatra-local", "locks", "de.lock"));
  });
});

describe("lockFileGuardPath", () => {
  it("resolves under .verbatra-local/locks/_lockfile.lock, a stem no real BCP-47 locale tag ever starts with", () => {
    const path = lockFileGuardPath("/proj");
    expect(path).toBe(join("/proj", ".verbatra-local", "locks", "_lockfile.lock"));
  });
});

describe("withLockFileGuard: mutual exclusion", () => {
  it("never runs two callbacks for the same cwd concurrently", async () => {
    const { fs, refused } = refusalWatchingFs();
    const order: string[] = [];
    const tracker = { inside: 0, max: 0 };
    const first = heldSection("A", order, tracker);
    const second = heldSection("B", order, tracker);
    second.release();

    const options = { pollIntervalMs: 5, acquireTimeoutMs: 30_000 };
    const a = withLockFileGuard("/proj", fs, first.run, options);
    await first.entered;
    const b = withLockFileGuard("/proj", fs, second.run, options);
    await Promise.race([refused, second.entered]);
    first.release();
    await Promise.all([a, b]);

    expect(tracker.max).toBe(1);
    expect(order).toEqual(["A-start", "A-end", "B-start", "B-end"]);
  });
});

describe("withLocaleWriteLock: mutual exclusion", () => {
  it("never runs two callbacks for the same (cwd, locale) concurrently (proof by construction, not timing luck)", async () => {
    const { fs, refused } = refusalWatchingFs();
    const order: string[] = [];
    const tracker = { inside: 0, max: 0 };
    const first = heldSection("A", order, tracker);
    const second = heldSection("B", order, tracker);
    second.release();

    const options = { pollIntervalMs: 5, acquireTimeoutMs: 30_000 };
    const a = withLocaleWriteLock("/proj", "de", fs, first.run, options);
    await first.entered;
    const b = withLocaleWriteLock("/proj", "de", fs, second.run, options);
    await Promise.race([refused, second.entered]);
    first.release();
    await Promise.all([a, b]);

    expect(tracker.max).toBe(1);
    expect(order).toEqual(["A-start", "A-end", "B-start", "B-end"]);
  });

  it("a different locale never contends with another locale's lock", async () => {
    const { fs, refused } = refusalWatchingFs();
    const order: string[] = [];
    const options = { pollIntervalMs: 5, acquireTimeoutMs: 30_000 };
    const bothInside = barrier(2);
    const contended = refused.then(() => {
      throw new Error("one locale's lock refused the other locale");
    });

    async function section(id: string): Promise<void> {
      order.push(`${id}-start`);
      await Promise.race([bothInside.arrive(), contended]);
      order.push(`${id}-end`);
    }

    await Promise.all([
      withLocaleWriteLock("/proj", "de", fs, () => section("de"), options),
      withLocaleWriteLock("/proj", "fr", fs, () => section("fr"), options),
    ]);

    expect(order.indexOf("de-end")).toBeGreaterThan(order.indexOf("fr-start"));
    expect(order.indexOf("fr-end")).toBeGreaterThan(order.indexOf("de-start"));
  });

  it("releases the lock (deletes the lock file) even when fn throws", async () => {
    const fs = makeLockFs();
    const options = { pollIntervalMs: 5, acquireTimeoutMs: 2000 };

    await expect(
      withLocaleWriteLock(
        "/proj",
        "de",
        fs,
        async () => {
          throw new Error("boom");
        },
        options,
      ),
    ).rejects.toThrow("boom");

    let ran = false;
    await withLocaleWriteLock(
      "/proj",
      "de",
      fs,
      async () => {
        ran = true;
      },
      options,
    );
    expect(ran).toBe(true);
  });
});

describe("withLocaleWriteLock: contention timeout", () => {
  it("throws a structured LOCK_CONTENDED naming the lock path once the timeout elapses, and never runs fn", async () => {
    const fs = makeFakeFs({ createExclusive: async (): Promise<boolean> => false });
    let ran = false;

    const error = await withLocaleWriteLock(
      "/proj",
      "de",
      fs,
      async () => {
        ran = true;
      },
      { pollIntervalMs: 5, acquireTimeoutMs: 20 },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("LOCK_CONTENDED");
    expect((error as SdkError).message).toContain(localeLockPath("/proj", "de"));
    expect(ran).toBe(false);
  });

  it("honors a short acquireTimeoutMs override rather than the ten-minute default", async () => {
    const fs = makeFakeFs({ createExclusive: async (): Promise<boolean> => false });
    const startedAt = Date.now();

    const error = await withLocaleWriteLock("/proj", "de", fs, async () => {}, {
      pollIntervalMs: 5,
      acquireTimeoutMs: 30,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("LOCK_CONTENDED");
    expect(Date.now() - startedAt).toBeLessThan(60_000);
  });
});

describe("withLocaleWriteLock: a lock file too large to be a lock", () => {
  it.each([
    [
      "a locale write lock",
      (fs: SdkFs, fn: () => Promise<void>) =>
        withLocaleWriteLock("/proj", "de", fs, fn, { acquireTimeoutMs: 600_000 }),
      localeLockPath("/proj", "de"),
    ],
    [
      "the lock-file guard",
      (fs: SdkFs, fn: () => Promise<void>) =>
        withLockFileGuard("/proj", fs, fn, { acquireTimeoutMs: 600_000 }),
      lockFileGuardPath("/proj"),
    ],
  ] as const)(
    "fails %s at once with an unreadable LOCK_CONTENDED naming the path, and never runs fn",
    async (_, acquire, path) => {
      const fs = makeFakeFs({
        createExclusive: async (): Promise<boolean> => false,
        readFileBounded: async (): Promise<BoundedFileRead> => ({ kind: "too-large" }),
      });
      let ran = false;
      const startedAt = Date.now();

      const error = await acquire(fs, async () => {
        ran = true;
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SdkError);
      expect((error as SdkError).code).toBe("LOCK_CONTENDED");
      expect((error as SdkError).message).toContain(
        `The lock file at ${path} is too large to be a lock and cannot be read.`,
      );
      expect(isUnreadableLockError(error)).toBe(true);
      expect(Date.now() - startedAt).toBeLessThan(5_000);
      expect(ran).toBe(false);
    },
  );

  it("does not mark a contention timeout or a non-SdkError as unreadable", async () => {
    const fs = makeFakeFs({ createExclusive: async (): Promise<boolean> => false });

    const timeout = await withLocaleWriteLock("/proj", "de", fs, async () => {}, {
      pollIntervalMs: 5,
      acquireTimeoutMs: 20,
    }).catch((e: unknown) => e);

    expect((timeout as SdkError).code).toBe("LOCK_CONTENDED");
    expect(isUnreadableLockError(timeout)).toBe(false);
    expect(isUnreadableLockError(new Error("too large"))).toBe(false);
  });
});

describe("unacquiredLockPath: only an acquire timeout marks a lock as busy", () => {
  it("names the lock path of a contention timeout", async () => {
    const fs = makeFakeFs({ createExclusive: async (): Promise<boolean> => false });

    const error = await withLocaleWriteLock("/proj", "de", fs, async () => {}, {
      pollIntervalMs: 5,
      acquireTimeoutMs: 20,
    }).catch((e: unknown) => e);

    expect(unacquiredLockPath(error)).toBe(localeLockPath("/proj", "de"));
  });

  it("names no path for a lock file too large to be a lock", async () => {
    const fs = makeFakeFs({
      createExclusive: async (): Promise<boolean> => false,
      readFileBounded: async (): Promise<BoundedFileRead> => ({ kind: "too-large" }),
    });

    const error = await withLocaleWriteLock("/proj", "de", fs, async () => {}, {
      acquireTimeoutMs: 600_000,
    }).catch((e: unknown) => e);

    expect((error as SdkError).code).toBe("LOCK_CONTENDED");
    expect(unacquiredLockPath(error)).toBeUndefined();
  });

  it("names no path for an error thrown inside the lock or for a non-SdkError", async () => {
    const fs = makeFakeFs();
    const inside = new SdkError("LOCK_CONTENDED", "taken over");

    const error = await withLocaleWriteLock("/proj", "de", fs, async () => {
      throw inside;
    }).catch((e: unknown) => e);

    expect(error).toBe(inside);
    expect(unacquiredLockPath(error)).toBeUndefined();
    expect(unacquiredLockPath(new Error("busy"))).toBeUndefined();
  });
});

describe("withLocaleWriteLock: wait progress", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function makeContendedFs(failures: number, payload: SdkFs["readFileBounded"]): SdkFs {
    let attempts = 0;
    return makeFakeFs(
      scriptedUntilCreated(() => {
        attempts += 1;
        return attempts > failures;
      }, payload),
    );
  }

  const PAST_GRACE_FAILURES = 25;

  async function waitEventsFor(
    failures: number,
    payload: SdkFs["readFileBounded"],
    options: Omit<LocaleWriteLockOptions, "onWait"> = {},
  ): Promise<LockWaitEvent[]> {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const events: LockWaitEvent[] = [];
    const promise = withLocaleWriteLock(
      "/proj",
      "de",
      makeContendedFs(failures, payload),
      async () => {},
      {
        pollIntervalMs: 50,
        acquireTimeoutMs: 5_000,
        ...options,
        onWait: (event) => events.push(event),
      },
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toBeUndefined();
    return events;
  }

  const foreignHolder = async (): Promise<BoundedFileRead> => ({
    kind: "ok",
    content: JSON.stringify({ pid: 4321, acquiredAt: "2026-07-18T00:00:00.000Z" }),
  });

  it("does not report a wait that ends within the first second", async () => {
    expect(await waitEventsFor(1, foreignHolder)).toHaveLength(0);
  });

  it("does not report a wait whose acquire budget elapses within the first second", async () => {
    const fs = makeContendedFs(Number.POSITIVE_INFINITY, foreignHolder);
    const events: LockWaitEvent[] = [];

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, {
        pollIntervalMs: 50,
        acquireTimeoutMs: 0,
        onWait: (event) => events.push(event),
      }),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(events).toHaveLength(0);
  });

  it("invokes onWait once the wait passes a second, carrying the holder pid and acquiredAt", async () => {
    const events = await waitEventsFor(PAST_GRACE_FAILURES, foreignHolder);

    expect(events).toHaveLength(1);
    expect(events[0]?.elapsedMs).toBeGreaterThanOrEqual(1_000);
    expect(events[0]).toMatchObject({
      lockPath: localeLockPath("/proj", "de"),
      holder: { pid: 4321, acquiredAt: "2026-07-18T00:00:00.000Z" },
    });
  });

  it.each<[string, BoundedFileRead]>([
    ["a malformed payload", { kind: "ok", content: "{ not valid json" }],
    ["valid JSON that is not an object", { kind: "ok", content: "42" }],
    ["an empty lock file", { kind: "ok", content: "" }],
  ])(
    "still invokes onWait, without holder fields, for %s seen on consecutive polls",
    async (_, read) => {
      const events = await waitEventsFor(PAST_GRACE_FAILURES, async () => read);

      expect(events).toHaveLength(1);
      expect(events[0]?.holder).toBeUndefined();
      expect(events[0]?.lockPath).toBe(localeLockPath("/proj", "de"));
    },
  );

  it("never invokes onWait while the lock file is missing", async () => {
    const missing = async (): Promise<BoundedFileRead> => ({ kind: "missing" });

    expect(await waitEventsFor(PAST_GRACE_FAILURES, missing)).toHaveLength(0);
  });

  it("does not report a released lock whose next holder has not written its payload yet", async () => {
    let reads = 0;
    const releasedThenEmpty = async (): Promise<BoundedFileRead> => {
      reads += 1;
      if (reads === 1) {
        return { kind: "missing" };
      }
      return reads === 2 ? { kind: "ok", content: "" } : { kind: "missing" };
    };
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const events: LockWaitEvent[] = [];
    let attempts = 0;
    const fs = makeFakeFs(
      scriptedUntilCreated(() => {
        attempts += 1;
        if (attempts === 1) {
          vi.setSystemTime(1_500);
        }
        return attempts > 2;
      }, releasedThenEmpty),
    );

    const promise = withLocaleWriteLock("/proj", "de", fs, async () => {}, {
      pollIntervalMs: 50,
      onWait: (event) => events.push(event),
    });
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBeUndefined();
    expect(reads).toBe(2);
    expect(events).toEqual([]);
  });

  it("reports an unreadable payload only once the same state is seen on two consecutive polls", async () => {
    const states: BoundedFileRead[] = [
      { kind: "ok", content: "" },
      { kind: "ok", content: "{" },
      { kind: "missing" },
      { kind: "ok", content: "{" },
      { kind: "ok", content: "{" },
    ];
    let reads = 0;
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const readsAtEvent: number[] = [];
    const fs = makeFakeFs(
      scriptedUntilCreated(
        () => {
          vi.setSystemTime(1_500);
          return reads >= states.length;
        },
        async (): Promise<BoundedFileRead> => {
          const state = states[reads] ?? { kind: "missing" };
          reads += 1;
          return state;
        },
      ),
    );

    const promise = withLocaleWriteLock("/proj", "de", fs, async () => {}, {
      pollIntervalMs: 50,
      onWait: () => readsAtEvent.push(reads),
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promise).resolves.toBeUndefined();
    expect(readsAtEvent).toEqual([5]);
  });

  it("carries only the fields present in a partial payload (pid without acquiredAt)", async () => {
    const events = await waitEventsFor(PAST_GRACE_FAILURES, async () => ({
      kind: "ok",
      content: JSON.stringify({ pid: 5 }),
    }));

    expect(events[0]?.holder).toEqual({ pid: 5 });
  });

  it("never invokes onWait for a lock this process holds on this machine", async () => {
    const liveness: LivenessContext = { host: "this-host", probe: () => undefined };
    const selfHeld = async (): Promise<BoundedFileRead> => ({
      kind: "ok",
      content: JSON.stringify({ pid: process.pid, hostname: "this-host" }),
    });

    expect(await waitEventsFor(PAST_GRACE_FAILURES, selfHeld, { liveness })).toHaveLength(0);
  });

  it.each([
    ["another pid on this machine", { pid: process.pid + 1, hostname: "this-host" }],
    ["this pid on another machine", { pid: process.pid, hostname: "other-host" }],
  ])("still invokes onWait for a lock held by %s", async (_, recorded) => {
    const liveness: LivenessContext = { host: "this-host", probe: () => undefined };
    const read = async (): Promise<BoundedFileRead> => ({
      kind: "ok",
      content: JSON.stringify(recorded),
    });

    const events = await waitEventsFor(PAST_GRACE_FAILURES, read, { liveness });

    expect(events).toHaveLength(1);
    expect(events[0]?.holder).toEqual(recorded);
  });

  it("invokes onWait periodically while waiting, with a non-decreasing elapsed time", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fs = makeFakeFs({
      createExclusive: async (): Promise<boolean> => false,
      readFileBounded: foreignHolder,
    });
    const events: LockWaitEvent[] = [];

    const promise = withLocaleWriteLock("/proj", "de", fs, async () => {}, {
      pollIntervalMs: 100,
      acquireTimeoutMs: 3_500,
      onWait: (event) => events.push(event),
    }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(3_600);
    const error = await promise;

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("LOCK_CONTENDED");
    const elapsed = events.map((event) => event.elapsedMs);
    expect(new Set(elapsed).size).toBeGreaterThanOrEqual(3);
    expect(elapsed[0]).toBeGreaterThanOrEqual(1_000);
    expect(elapsed).toEqual([...elapsed].sort((a, b) => a - b));
    expect(events.length).toBeLessThanOrEqual(5);
    const gaps = elapsed.slice(1).map((ms, index) => ms - (elapsed[index] ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(1_000);
    }
  });

  it("never invokes onWait on an uncontended acquire", async () => {
    const fs = makeFakeFs();
    const events: LockWaitEvent[] = [];

    await withLocaleWriteLock("/proj", "de", fs, async () => {}, {
      onWait: (event) => events.push(event),
    });

    expect(events).toHaveLength(0);
  });
});

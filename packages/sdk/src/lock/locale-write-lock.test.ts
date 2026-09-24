import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkError } from "../errors.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import { makeFakeFs } from "../test-support.js";
import type { LivenessContext } from "./holder-liveness.js";
import {
  type LocaleWriteLockOptions,
  type LockWaitEvent,
  localeLockPath,
  lockFileGuardPath,
  withLocaleWriteLock,
  withLockFileGuard,
} from "./locale-write-lock.js";

function sleep(ms: number): Promise<void> {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

function makeLockFs(): SdkFs {
  const held = new Set<string>();
  return makeFakeFs({
    createExclusive: async (path: string): Promise<boolean> => {
      if (held.has(path)) {
        return false;
      }
      held.add(path);
      return true;
    },
    deleteFile: async (path: string): Promise<void> => {
      held.delete(path);
    },
  });
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
    const fs = makeLockFs();
    let insideCount = 0;
    let maxInsideCount = 0;

    async function criticalSection(): Promise<void> {
      insideCount += 1;
      maxInsideCount = Math.max(maxInsideCount, insideCount);
      await sleep(20);
      insideCount -= 1;
    }

    const options = { pollIntervalMs: 5, acquireTimeoutMs: 2000 };
    await Promise.all([
      withLockFileGuard("/proj", fs, criticalSection, options),
      withLockFileGuard("/proj", fs, criticalSection, options),
    ]);

    expect(maxInsideCount).toBe(1);
  });
});

describe("withLocaleWriteLock: mutual exclusion", () => {
  it("never runs two callbacks for the same (cwd, locale) concurrently (proof by construction, not timing luck)", async () => {
    const fs = makeLockFs();
    let insideCount = 0;
    let maxInsideCount = 0;
    const order: string[] = [];

    async function criticalSection(id: string, workMs: number): Promise<void> {
      insideCount += 1;
      maxInsideCount = Math.max(maxInsideCount, insideCount);
      order.push(`${id}-start`);
      await sleep(workMs);
      order.push(`${id}-end`);
      insideCount -= 1;
    }

    const options = { pollIntervalMs: 5, acquireTimeoutMs: 2000 };
    const a = withLocaleWriteLock("/proj", "de", fs, () => criticalSection("A", 30), options);
    const b = withLocaleWriteLock("/proj", "de", fs, () => criticalSection("B", 5), options);

    await Promise.all([a, b]);

    expect(maxInsideCount).toBe(1);
    expect(order).toEqual(["A-start", "A-end", "B-start", "B-end"]);
  });

  it("a different locale never contends with another locale's lock", async () => {
    const fs = makeLockFs();
    const order: string[] = [];
    const options = { pollIntervalMs: 5, acquireTimeoutMs: 2000 };

    async function section(id: string): Promise<void> {
      order.push(`${id}-start`);
      await sleep(10);
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

describe("withLocaleWriteLock: wait progress", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function makeContendedFs(failures: number, payload: SdkFs["readFileBounded"]): SdkFs {
    let attempts = 0;
    return makeFakeFs({
      createExclusive: async (): Promise<boolean> => {
        attempts += 1;
        return attempts > failures;
      },
      readFileBounded: payload,
    });
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
    ["a lock file too large to read", { kind: "too-large" }],
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
    const fs = makeFakeFs({
      createExclusive: async (): Promise<boolean> => {
        attempts += 1;
        if (attempts === 1) {
          vi.setSystemTime(1_500);
        }
        return attempts > 2;
      },
      readFileBounded: releasedThenEmpty,
    });

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
    const fs = makeFakeFs({
      createExclusive: async (): Promise<boolean> => {
        vi.setSystemTime(1_500);
        return reads >= states.length;
      },
      readFileBounded: async (): Promise<BoundedFileRead> => {
        const state = states[reads] ?? { kind: "missing" };
        reads += 1;
        return state;
      },
    });

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

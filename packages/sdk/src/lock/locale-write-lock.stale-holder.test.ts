import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BoundedFileRead, defaultFs, type SdkFs } from "../fs.js";
import { makeFakeFs, makeTempDir } from "../test-support.js";
import { currentHostLiveness, type LivenessContext } from "./holder-liveness.js";
import { localeLockPath, releaseHeldLocks, withLocaleWriteLock } from "./locale-write-lock.js";

const DEAD_PID = 999_001;
const SECOND_DEAD_PID = 999_002;
const LIVE_PID = 999_003;

const liveness: LivenessContext = {
  host: "test-host",
  probe: (pid) => {
    if (pid === DEAD_PID || pid === SECOND_DEAD_PID) {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    }
  },
};

function holder(pid: number, host = liveness.host): Record<string, unknown> {
  return { pid, hostname: host, acquiredAt: "2026-01-01T00:00:00.000Z" };
}

function spawnedAndExitedPid(): number {
  return spawnSync(process.execPath, ["-e", ""]).pid;
}

async function plantLock(path: string, payload: Record<string, unknown>): Promise<string> {
  const content = JSON.stringify(payload);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return content;
}

async function exists(path: string): Promise<boolean> {
  return defaultFs.fileExists(path);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function memoryFs(files: Map<string, string>, overrides: Partial<SdkFs> = {}): SdkFs {
  return makeFakeFs({
    readFileBounded: async (path): Promise<BoundedFileRead> => {
      const content = files.get(path);
      return content === undefined ? { kind: "missing" } : { kind: "ok", content };
    },
    createExclusive: async (path, data) => {
      if (files.has(path)) {
        return false;
      }
      files.set(path, data);
      return true;
    },
    deleteFile: async (path) => {
      files.delete(path);
    },
    ...overrides,
  });
}

const FAST = { pollIntervalMs: 5, acquireTimeoutMs: 300, liveness };

const LOCK = localeLockPath("/proj", "de");
const GUARD = `${LOCK}.reclaim`;

let cwd: string;

beforeEach(async () => {
  cwd = await makeTempDir();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await releaseHeldLocks();
  await rm(cwd, { recursive: true, force: true });
});

describe("withLocaleWriteLock: abandoned lock reclaim", () => {
  it("reclaims a lock whose holder really exited on this machine, with the real liveness probe", async () => {
    const path = localeLockPath(cwd, "de");
    const current = currentHostLiveness();
    await plantLock(path, {
      pid: spawnedAndExitedPid(),
      hostname: current.host,
      bootId: current.bootId,
      pidNamespace: current.pidNamespace,
      acquiredAt: "2026-01-01T00:00:00.000Z",
    });
    let ran = false;

    await withLocaleWriteLock(
      cwd,
      "de",
      defaultFs,
      async () => {
        ran = true;
      },
      { pollIntervalMs: 5, acquireTimeoutMs: 60_000 },
    );

    expect(ran).toBe(true);
    expect(await exists(path)).toBe(false);
    expect(await exists(`${path}.reclaim`)).toBe(false);
  });

  it("records the pid, host name and kernel identity of the new holder", async () => {
    const path = localeLockPath(cwd, "de");
    const current = currentHostLiveness();
    let content = "";

    await withLocaleWriteLock(cwd, "de", defaultFs, async () => {
      content = await readFile(path, "utf8");
    });

    const recorded = JSON.parse(content) as Record<string, unknown>;
    expect(recorded).toMatchObject({ pid: process.pid, hostname: current.host });
    expect(recorded.bootId).toBe(current.bootId);
    expect(recorded.pidNamespace).toBe(current.pidNamespace);
  });

  it("records the kernel identity the liveness context carries", async () => {
    const files = new Map<string, string>();
    let content = "";

    await withLocaleWriteLock(
      "/proj",
      "de",
      memoryFs(files),
      async () => {
        content = files.get(LOCK) ?? "";
      },
      { liveness: { ...liveness, bootId: "boot-a", pidNamespace: "pid:[1]" } },
    );

    expect(JSON.parse(content)).toMatchObject({
      hostname: "test-host",
      bootId: "boot-a",
      pidNamespace: "pid:[1]",
    });
  });

  it.each([
    ["a live holder on this host", holder(LIVE_PID)],
    ["a dead pid recorded by another host", holder(DEAD_PID, "elsewhere")],
    ["a lock written without a host name", { pid: DEAD_PID }],
    ["a dead pid recorded in another PID namespace", { ...holder(DEAD_PID), pidNamespace: "x" }],
  ])("keeps waiting, then fails with LOCK_CONTENDED, for %s", async (_label, payload) => {
    const path = localeLockPath(cwd, "de");
    const planted = await plantLock(path, payload);

    await expect(
      withLocaleWriteLock(cwd, "de", defaultFs, async () => undefined, FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(await readFile(path, "utf8")).toBe(planted);
  });

  it("lets exactly one of many racing contenders into the critical section at a time", async () => {
    await plantLock(localeLockPath(cwd, "de"), holder(DEAD_PID));
    let inside = 0;
    let maxInside = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        withLocaleWriteLock(
          cwd,
          "de",
          defaultFs,
          async () => {
            inside += 1;
            maxInside = Math.max(maxInside, inside);
            await new Promise((res) => setTimeout(res, 5));
            inside -= 1;
          },
          { pollIntervalMs: 2, acquireTimeoutMs: 60_000, liveness },
        ),
      ),
    );

    expect(maxInside).toBe(1);
  });

  it("clears a reclaim guard left by a dead reclaimer, then reclaims the lock", async () => {
    const path = localeLockPath(cwd, "de");
    await plantLock(path, holder(DEAD_PID));
    await plantLock(`${path}.reclaim`, holder(SECOND_DEAD_PID));

    await withLocaleWriteLock(cwd, "de", defaultFs, async () => undefined, {
      pollIntervalMs: 2,
      acquireTimeoutMs: 60_000,
      liveness,
    });

    expect(await exists(path)).toBe(false);
    expect(await exists(`${path}.reclaim`)).toBe(false);
  });

  it("does not reclaim while a live process holds the reclaim guard", async () => {
    const path = localeLockPath(cwd, "de");
    const planted = await plantLock(path, holder(DEAD_PID));
    await plantLock(`${path}.reclaim`, holder(LIVE_PID));

    await expect(
      withLocaleWriteLock(cwd, "de", defaultFs, async () => undefined, FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(await readFile(path, "utf8")).toBe(planted);
  });

  it("succeeds with a zero acquire timeout when the lock in the way is reclaimable", async () => {
    const files = new Map([[LOCK, JSON.stringify(holder(DEAD_PID))]]);
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      memoryFs(files),
      async () => {
        ran = true;
      },
      { pollIntervalMs: 5, acquireTimeoutMs: 0, liveness },
    );

    expect(ran).toBe(true);
    expect(files.size).toBe(0);
  });

  it("swallows a failure to delete its own reclaim guard and still takes the lock", async () => {
    const files = new Map([[LOCK, JSON.stringify(holder(DEAD_PID))]]);
    const fs = memoryFs(files, {
      deleteFile: async (path) => {
        if (path === GUARD) {
          throw Object.assign(new Error("read-only"), { code: "EROFS" });
        }
        files.delete(path);
      },
    });
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      fs,
      async () => {
        ran = true;
      },
      { pollIntervalMs: 5, acquireTimeoutMs: 60_000, liveness },
    );

    expect(ran).toBe(true);
    expect(files.has(GUARD)).toBe(true);
    expect(files.has(LOCK)).toBe(false);
  });

  it("leaves the lock alone when its content changed between the liveness check and the reclaim", async () => {
    const deleted: string[] = [];
    let reads = 0;
    const fs: SdkFs = makeFakeFs({
      createExclusive: async (path) => path.endsWith(".reclaim"),
      readFileBounded: async () => {
        reads += 1;
        const pid = reads === 1 ? DEAD_PID : SECOND_DEAD_PID;
        return { kind: "ok", content: JSON.stringify(holder(pid)) };
      },
      deleteFile: async (path) => {
        deleted.push(path);
      },
    });

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, {
        pollIntervalMs: 5,
        acquireTimeoutMs: 0,
        liveness,
      }),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(deleted).toEqual([GUARD]);
  });
});

describe("withLocaleWriteLock: a reclaim the file system refuses", () => {
  it("maps a failure to delete the abandoned lock to LOCK_CONTENDED", async () => {
    const refusal = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const files = new Map([[LOCK, JSON.stringify(holder(DEAD_PID))]]);
    const fs = memoryFs(files, {
      deleteFile: async (path) => {
        if (path === LOCK) {
          throw refusal;
        }
        files.delete(path);
      },
    });

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, FAST),
    ).rejects.toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(LOCK),
      cause: refusal,
    });
    expect(files.has(GUARD)).toBe(false);
  });

  it("maps a failure to delete an abandoned reclaim guard to LOCK_CONTENDED", async () => {
    const refusal = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const files = new Map([
      [LOCK, JSON.stringify(holder(DEAD_PID))],
      [GUARD, JSON.stringify(holder(SECOND_DEAD_PID))],
    ]);
    const fs = memoryFs(files, {
      deleteFile: async (path) => {
        if (path === GUARD) {
          throw refusal;
        }
        files.delete(path);
      },
    });

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, {
        ...FAST,
        acquireTimeoutMs: 60_000,
      }),
    ).rejects.toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(GUARD),
      cause: refusal,
    });
  });
});

describe("withLocaleWriteLock: clearing an abandoned reclaim guard", () => {
  const POLL = 100;
  const G1 = JSON.stringify(holder(SECOND_DEAD_PID));

  function recordingFs(files: Map<string, string>, deleted: string[]): SdkFs {
    return memoryFs(files, {
      deleteFile: async (path) => {
        deleted.push(path);
        files.delete(path);
      },
    });
  }

  function useDeterministicPolls(): { advanceClock: (ms: number) => void } {
    let now = 1_000_000;
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(Date, "now").mockImplementation(() => now);
    return {
      advanceClock: (ms) => {
        now += ms;
      },
    };
  }

  it("never deletes a guard in the poll that first sees it, only on a later identical sighting", async () => {
    const { advanceClock } = useDeterministicPolls();
    const files = new Map([
      [LOCK, JSON.stringify(holder(DEAD_PID))],
      [GUARD, G1],
    ]);
    const deleted: string[] = [];
    let ran = false;

    const acquisition = withLocaleWriteLock(
      "/proj",
      "de",
      recordingFs(files, deleted),
      async () => {
        ran = true;
      },
      { pollIntervalMs: POLL, acquireTimeoutMs: 60_000, liveness },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get(GUARD)).toBe(G1);

    advanceClock(POLL);
    await vi.advanceTimersByTimeAsync(POLL);
    expect(deleted).toEqual([GUARD]);
    expect(files.has(LOCK)).toBe(true);

    advanceClock(POLL);
    await vi.advanceTimersByTimeAsync(POLL);
    await acquisition;
    expect(ran).toBe(true);
  });

  it("waits a full poll interval before trusting a second identical sighting", async () => {
    const { advanceClock } = useDeterministicPolls();
    const files = new Map([
      [LOCK, JSON.stringify(holder(DEAD_PID))],
      [GUARD, G1],
    ]);
    const deleted: string[] = [];

    const acquisition = withLocaleWriteLock(
      "/proj",
      "de",
      recordingFs(files, deleted),
      async () => undefined,
      { pollIntervalMs: POLL, acquireTimeoutMs: 60_000, liveness },
    );
    await vi.advanceTimersByTimeAsync(0);
    advanceClock(POLL - 1);
    await vi.advanceTimersByTimeAsync(POLL);
    expect(deleted).toEqual([]);

    advanceClock(1);
    await vi.advanceTimersByTimeAsync(POLL);
    expect(deleted).toEqual([GUARD]);

    advanceClock(POLL);
    await vi.advanceTimersByTimeAsync(POLL);
    await acquisition;
  });

  it("does not delete the fresh guard another waiter put in place of the abandoned one", async () => {
    const { advanceClock } = useDeterministicPolls();
    const files = new Map([
      [LOCK, JSON.stringify(holder(DEAD_PID))],
      [GUARD, G1],
    ]);
    const deleted: string[] = [];
    const g2 = JSON.stringify(holder(LIVE_PID));

    const waiterY = withLocaleWriteLock(
      "/proj",
      "de",
      recordingFs(files, deleted),
      async () => undefined,
      { pollIntervalMs: POLL, acquireTimeoutMs: 60_000, liveness },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get(GUARD)).toBe(G1);

    files.set(GUARD, g2);
    advanceClock(POLL);
    await vi.advanceTimersByTimeAsync(POLL);
    expect(files.get(GUARD)).toBe(g2);
    expect(deleted).toEqual([]);

    files.delete(LOCK);
    files.delete(GUARD);
    advanceClock(POLL);
    await vi.advanceTimersByTimeAsync(POLL);
    await waiterY;
    expect(deleted).toEqual([LOCK]);
  });

  it("starts the wait over when an abandoned guard is replaced by another abandoned one", async () => {
    const { advanceClock } = useDeterministicPolls();
    const files = new Map([
      [LOCK, JSON.stringify(holder(DEAD_PID))],
      [GUARD, G1],
    ]);
    const deleted: string[] = [];
    const g3 = JSON.stringify({
      ...holder(SECOND_DEAD_PID),
      acquiredAt: "2026-02-01T00:00:00.000Z",
    });

    const acquisition = withLocaleWriteLock(
      "/proj",
      "de",
      recordingFs(files, deleted),
      async () => undefined,
      { pollIntervalMs: POLL, acquireTimeoutMs: 60_000, liveness },
    );
    await vi.advanceTimersByTimeAsync(0);
    files.set(GUARD, g3);
    advanceClock(POLL);
    await vi.advanceTimersByTimeAsync(POLL);
    expect(deleted).toEqual([]);

    advanceClock(POLL);
    await vi.advanceTimersByTimeAsync(POLL);
    expect(deleted).toEqual([GUARD]);

    advanceClock(POLL);
    await vi.advanceTimersByTimeAsync(POLL);
    await acquisition;
  });
});

describe("releaseHeldLocks", () => {
  it("deletes a lock whose operation is still in flight, as a forced exit needs", async () => {
    const path = localeLockPath(cwd, "de");
    const entered = deferred();
    const finish = deferred();

    const operation = withLocaleWriteLock(cwd, "de", defaultFs, async () => {
      entered.resolve();
      await finish.promise;
    });
    await entered.promise;
    expect(await exists(path)).toBe(true);

    await releaseHeldLocks();
    expect(await exists(path)).toBe(false);

    const successor = await plantLock(path, holder(LIVE_PID));
    finish.resolve();
    await operation;
    expect(await readFile(path, "utf8")).toBe(successor);
  });

  it("never rejects when a lock file cannot be deleted", async () => {
    const entered = deferred();
    const finish = deferred();
    const fs = makeFakeFs({
      deleteFile: async () => {
        throw new Error("read-only");
      },
    });

    const operation = withLocaleWriteLock("/proj", "de", fs, async () => {
      entered.resolve();
      await finish.promise;
    });
    await entered.promise;

    await expect(releaseHeldLocks()).resolves.toBeUndefined();
    finish.resolve();
    await operation;
  });

  it("does nothing when no lock is held", async () => {
    await expect(releaseHeldLocks()).resolves.toBeUndefined();
  });
});

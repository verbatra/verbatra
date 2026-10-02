import { mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LocaleResource } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeTargetResource } from "../flow/write-target.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { makeTempDir, memoryLockFs } from "../test-support.js";
import { currentHostLiveness, identityTag, type LivenessContext } from "./holder-liveness.js";
import {
  assertLocksHeld,
  localeLockPath,
  lockFileGuardPath,
  probeLock,
  releaseHeldLocks,
  withLocaleWriteLock,
  withLockFileGuard,
} from "./locale-write-lock.js";

const DEAD_PID = 999_201;
const LIVE_PID = 999_203;

const liveness: LivenessContext = {
  host: "test-host",
  probe: (pid) => {
    if (pid === DEAD_PID) {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    }
  },
};

function record(pid: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    pid,
    hostname: liveness.host,
    acquiredAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  });
}

const LOCK = localeLockPath("/proj", "de");
const L1 = record(DEAD_PID);
const FOREIGN = record(LIVE_PID, { nonce: "someone-else" });
const ASIDE = /^(.+)\.(\d+)\.([0-9a-f]{12})\.[0-9a-f-]{36}\.stale$/;

const FAIL_FAST = { pollIntervalMs: 5, acquireTimeoutMs: 0, liveness };
const PATIENT = { pollIntervalMs: 5, acquireTimeoutMs: 60_000, liveness };

const RESOURCE: LocaleResource = {
  locale: "de",
  namespace: "common",
  format: "i18next-json",
  entries: new Map(),
};

function recordingAdapter(written: string[], label: string): FormatAdapter {
  return {
    format: "i18next-json",
    canHandle: () => true,
    read: async () => {
      throw new Error("not used");
    },
    write: async () => {
      written.push(label);
    },
    extractPlaceholders: () => [],
    validateMessage: () => true,
  };
}

function commit(written: string[], label: string): Promise<void> {
  return writeTargetResource(
    recordingAdapter(written, label),
    RESOURCE,
    "/proj/de.json",
    "/proj",
    {},
  );
}

interface Gate {
  readonly entered: Promise<void>;
  readonly open: () => void;
  readonly wait: () => Promise<void>;
}

function gate(): Gate {
  let enter: () => void = () => undefined;
  let open: () => void = () => undefined;
  const entered = new Promise<void>((res) => {
    enter = res;
  });
  const opened = new Promise<void>((res) => {
    open = res;
  });
  return {
    entered,
    open,
    wait: async () => {
      enter();
      await opened;
    },
  };
}

function once<A extends unknown[]>(action: (...args: A) => Promise<void> | void) {
  let done = false;
  return async (...args: A): Promise<void> => {
    if (!done) {
      done = true;
      await action(...args);
    }
  };
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await releaseHeldLocks();
});

describe("withLocaleWriteLock: two processes that both believe they hold the lock (race 1)", () => {
  it("fails the displaced holder's next commit with LOCK_CONTENDED and writes nothing for it", async () => {
    const written: string[] = [];
    const holderA = gate();
    let holderAResult: Promise<unknown> = Promise.resolve();
    const memory = memoryLockFs({
      beforeRename: once(async (from: string) => {
        if (from !== LOCK) {
          return;
        }
        memory.files.delete(LOCK);
        holderAResult = withLocaleWriteLock(
          "/proj",
          "de",
          memory.fs,
          async () => {
            await holderA.wait();
            await commit(written, "A");
          },
          FAIL_FAST,
        ).catch((error: unknown) => error);
        await holderA.entered;
      }),
      afterRename: once(async (from: string) => {
        if (from === LOCK) {
          memory.put(LOCK, FOREIGN);
        }
      }),
    });
    memory.put(LOCK, L1);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    holderA.open();

    expect(await holderAResult).toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining("was taken over by another process"),
    });
    expect(written).toEqual([]);
    expect(memory.content(LOCK)).toBe(FOREIGN);
    expect([...memory.files.keys()].filter((path) => ASIDE.test(path))).toEqual([]);
  });

  it("lets only the holder whose token is in the lock file write when two in-process holders overlap", async () => {
    const written: string[] = [];
    const holderA = gate();
    const holderB = gate();
    let holderAResult: Promise<unknown> = Promise.resolve();
    let holderBResult: Promise<unknown> = Promise.resolve();
    const memory = memoryLockFs({
      beforeRename: once(async (from: string) => {
        if (from !== LOCK) {
          return;
        }
        memory.files.delete(LOCK);
        holderAResult = withLocaleWriteLock(
          "/proj",
          "de",
          memory.fs,
          async () => {
            await holderA.wait();
            await commit(written, "A");
          },
          FAIL_FAST,
        ).catch((error: unknown) => error);
        await holderA.entered;
      }),
      afterRename: once(async (from: string) => {
        if (from !== LOCK) {
          return;
        }
        holderBResult = withLocaleWriteLock(
          "/proj",
          "de",
          memory.fs,
          async () => {
            await holderB.wait();
            await commit(written, "B");
          },
          FAIL_FAST,
        ).catch((error: unknown) => error);
        await holderB.entered;
      }),
    });
    memory.put(LOCK, L1);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    holderA.open();
    holderB.open();

    expect(await holderAResult).toMatchObject({ code: "LOCK_CONTENDED" });
    expect(await holderBResult).toBeUndefined();
    expect(written).toEqual(["B"]);
    expect(memory.files.size).toBe(0);
  });
});

describe("withLocaleWriteLock: a record put back for a holder that already released (race 2)", () => {
  it("reclaims the phantom once its heartbeat is three intervals old, not before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(1_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const heartbeatIntervalMs = 1_000;
    const holder = gate();
    let holderDone: Promise<void> = Promise.resolve();
    let holderError: unknown;
    const memory = memoryLockFs({
      beforeRename: once(async (from: string) => {
        if (from !== LOCK) {
          return;
        }
        memory.files.delete(LOCK);
        holderDone = withLocaleWriteLock("/proj", "de", memory.fs, () => holder.wait(), {
          ...FAIL_FAST,
          heartbeatIntervalMs,
        }).then(
          () => undefined,
          (error: unknown) => {
            holderError = error;
          },
        );
        await holder.entered;
      }),
      afterRename: once(async (from: string) => {
        if (from !== LOCK) {
          return;
        }
        holder.open();
        await holderDone;
      }),
    });
    memory.put(LOCK, L1);
    let entered = false;

    const waiter = withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        entered = true;
      },
      { pollIntervalMs: 100, acquireTimeoutMs: 60_000, liveness, heartbeatIntervalMs },
    );
    await vi.advanceTimersByTimeAsync(0);
    await holderDone;
    const phantom = memory.content(LOCK);
    expect(holderError).toMatchObject({ code: "LOCK_CONTENDED" });

    expect(phantom).toBeDefined();
    expect(JSON.parse(phantom ?? "{}")).toMatchObject({ pid: process.pid, heartbeatMs: 1_000 });

    await vi.advanceTimersByTimeAsync(2_900);
    expect(entered).toBe(false);
    expect(memory.content(LOCK)).toBe(phantom);

    await vi.advanceTimersByTimeAsync(300);
    await waiter;
    expect(entered).toBe(true);
    expect(memory.files.size).toBe(0);
  });
});

describe("withLocaleWriteLock: the holder heartbeat", () => {
  it("refreshes the lock file every interval while held and stops once released", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const memory = memoryLockFs();
    const holder = gate();

    const held = withLocaleWriteLock("/proj", "de", memory.fs, () => holder.wait(), {
      ...FAIL_FAST,
      heartbeatIntervalMs: 1_000,
    });
    await holder.entered;
    expect(memory.touched).toEqual([LOCK]);
    await vi.advanceTimersByTimeAsync(3_500);

    expect(memory.touched).toEqual([LOCK, LOCK, LOCK, LOCK]);
    expect(memory.files.get(LOCK)?.mtime).toBe(Date.now() - 500);

    holder.open();
    await held;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(memory.touched.filter((path) => path === LOCK)).toHaveLength(4);
  });

  it("keeps a waiter out for as long as the live holder keeps beating", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearInterval", "Date"] });
    vi.spyOn(Math, "random").mockReturnValue(0);
    const memory = memoryLockFs();
    const holder = gate();
    const options = { ...PATIENT, pollIntervalMs: 100, heartbeatIntervalMs: 1_000 };
    const held = withLocaleWriteLock("/proj", "de", memory.fs, () => holder.wait(), options);
    await holder.entered;
    let entered = false;

    const waiter = withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        entered = true;
      },
      options,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(entered).toBe(false);

    holder.open();
    await held;
    await vi.advanceTimersByTimeAsync(200);
    await waiter;
    expect(entered).toBe(true);
  });

  it("does not touch a lock file that no longer holds its token", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const memory = memoryLockFs();
    const holder = gate();

    const held = withLocaleWriteLock("/proj", "de", memory.fs, () => holder.wait(), {
      ...FAIL_FAST,
      heartbeatIntervalMs: 1_000,
    }).catch((error: unknown) => error);
    await holder.entered;
    memory.put(LOCK, FOREIGN);
    await vi.advanceTimersByTimeAsync(2_500);

    expect(memory.touched).toEqual([LOCK]);
    holder.open();
    expect(await held).toMatchObject({ code: "LOCK_CONTENDED" });
    expect(memory.content(LOCK)).toBe(FOREIGN);
  });

  it("swallows a heartbeat that cannot read its lock file", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    let failReads = false;
    const memory = memoryLockFs();
    const fs: SdkFs = {
      ...memory.fs,
      readFileBounded: async (path, maxBytes) => {
        if (failReads) {
          throw Object.assign(new Error("EIO"), { code: "EIO" });
        }
        return memory.fs.readFileBounded(path, maxBytes);
      },
    };
    const holder = gate();

    const held = withLocaleWriteLock("/proj", "de", fs, () => holder.wait(), {
      ...FAIL_FAST,
      heartbeatIntervalMs: 1_000,
    });
    await holder.entered;
    failReads = true;
    await vi.advanceTimersByTimeAsync(1_500);
    failReads = false;
    holder.open();

    await expect(held).resolves.toBeUndefined();
    expect(memory.touched.filter((path) => path === LOCK)).toEqual([LOCK]);
  });

  it("stamps a fresh lock with this process's clock, whatever time the file server gave it", async () => {
    const memory = memoryLockFs();
    const skewed: SdkFs = {
      ...memory.fs,
      createExclusive: async (path, data) => {
        const created = await memory.fs.createExclusive(path, data);
        if (created) {
          memory.put(path, data, Date.now() - 3_600_000);
        }
        return created;
      },
    };
    const holder = gate();
    const options = { ...FAIL_FAST, heartbeatIntervalMs: 1_000 };
    const held = withLocaleWriteLock("/proj", "de", skewed, () => holder.wait(), options);
    await holder.entered;

    await expect(
      withLocaleWriteLock("/proj", "de", skewed, async () => undefined, options),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    holder.open();
    await expect(held).resolves.toBeUndefined();
  });

  it("records a random ownership token and its heartbeat interval in the lock", async () => {
    const memory = memoryLockFs();
    const tokens: unknown[] = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await withLocaleWriteLock(
        "/proj",
        "de",
        memory.fs,
        async () => {
          tokens.push(JSON.parse(memory.content(LOCK) ?? "{}"));
        },
        { ...FAIL_FAST, heartbeatIntervalMs: 2_000 },
      );
    }

    expect(tokens[0]).toMatchObject({ nonce: expect.any(String), heartbeatMs: 2_000 });
    expect((tokens[0] as { nonce: string }).nonce).not.toBe((tokens[1] as { nonce: string }).nonce);
  });

  it("records no heartbeat interval when the file system cannot touch files", async () => {
    const memory = memoryLockFs();
    const { touch: _touch, ...withoutTouch } = memory.fs;
    let payload: unknown;

    await withLocaleWriteLock(
      "/proj",
      "de",
      withoutTouch,
      async () => {
        payload = JSON.parse(memory.content(LOCK) ?? "{}");
      },
      FAIL_FAST,
    );

    expect(payload).toMatchObject({ nonce: expect.any(String) });
    expect(payload).not.toHaveProperty("heartbeatMs");
  });
});

describe("withLocaleWriteLock: judging a live holder by its heartbeat", () => {
  const OLD = 10_000;

  it("reclaims a lock on this machine whose live holder stopped beating three intervals ago", async () => {
    const memory = memoryLockFs();
    memory.put(LOCK, record(LIVE_PID, { heartbeatMs: 1_000 }), Date.now() - 3_000);
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        ran = true;
      },
      FAIL_FAST,
    );

    expect(ran).toBe(true);
  });

  it.each<[string, string, number]>([
    ["whose heartbeat is still fresh", record(LIVE_PID, { heartbeatMs: 1_000 }), 2_000],
    ["that records no heartbeat, as an older version wrote it", record(LIVE_PID), OLD],
    [
      "from another machine",
      JSON.stringify({ pid: LIVE_PID, hostname: "other-host", heartbeatMs: 1_000 }),
      OLD,
    ],
    ["with a zero heartbeat", record(LIVE_PID, { heartbeatMs: 0 }), OLD],
    ["with a fractional heartbeat", record(LIVE_PID, { heartbeatMs: 1.5 }), OLD],
    ["with a heartbeat that is not a number", record(LIVE_PID, { heartbeatMs: "1000" }), OLD],
  ])("leaves a live holder's lock %s alone", async (_label, content, age) => {
    const memory = memoryLockFs();
    memory.put(LOCK, content, Date.now() - age);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(memory.content(LOCK)).toBe(content);
  });

  it("falls back to the pid alone on a file system that cannot report modification times", async () => {
    const memory = memoryLockFs();
    const { mtimeMs: _mtimeMs, ...withoutMtime } = memory.fs;
    const stale = record(LIVE_PID, { heartbeatMs: 1_000 });
    memory.put(LOCK, stale, 0);

    await expect(
      withLocaleWriteLock("/proj", "de", withoutMtime, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(memory.content(LOCK)).toBe(stale);
  });

  it("reports a heartbeat-stale lock as free to probeLock", async () => {
    const memory = memoryLockFs();
    memory.put(LOCK, record(LIVE_PID, { heartbeatMs: 1_000 }), Date.now() - OLD);

    expect(await probeLock(LOCK, memory.fs, liveness)).toBe("free");
  });

  it("reclaims a heartbeat-stale lock through the default file system", async () => {
    const cwd = await makeTempDir();
    const path = localeLockPath(cwd, "de");
    const here = currentHostLiveness();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        pid: process.ppid,
        hostname: here.host,
        bootId: here.bootId,
        pidNamespace: here.pidNamespace,
        heartbeatMs: 1_000,
      }),
      "utf8",
    );
    const old = new Date(Date.now() - 60_000);
    await utimes(path, old, old);
    let ran = false;

    try {
      await withLocaleWriteLock(
        cwd,
        "de",
        defaultFs,
        async () => {
          ran = true;
        },
        { pollIntervalMs: 5, acquireTimeoutMs: 0 },
      );

      expect(ran).toBe(true);
      expect(await readdir(dirname(path))).toEqual([]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("withLocaleWriteLock: a mover that crashed between the rename and the restore", () => {
  it("fails the live holder's next commit once another process took the freed path, and sweeps the aside", async () => {
    const written: string[] = [];
    const memory = memoryLockFs();
    const holderA = gate();
    const holderB = gate();
    const aside = `${LOCK}.${DEAD_PID}.${identityTag(liveness)}.00000000-0000-4000-8000-000000000000.stale`;

    const heldByA = withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        await holderA.wait();
        await commit(written, "A");
      },
      FAIL_FAST,
    ).catch((error: unknown) => error);
    await holderA.entered;
    const recordOfA = memory.files.get(LOCK);
    memory.files.delete(LOCK);
    if (recordOfA !== undefined) {
      memory.files.set(aside, recordOfA);
    }
    const heldByB = withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        await holderB.wait();
        await commit(written, "B");
      },
      FAIL_FAST,
    );
    await holderB.entered;

    expect(memory.files.has(aside)).toBe(false);

    holderA.open();
    expect(await heldByA).toMatchObject({ code: "LOCK_CONTENDED" });
    holderB.open();
    await heldByB;
    expect(written).toEqual(["B"]);
    expect(memory.files.size).toBe(0);
  });
});

describe("withLocaleWriteLock: releasing only its own lock", () => {
  it("moves its own lock aside and deletes it on release", async () => {
    const memory = memoryLockFs();

    await withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST);

    expect(memory.renames.map(([from]) => from)).toEqual([LOCK]);
    expect(memory.files.size).toBe(0);
  });

  it("leaves a record another process put in its place and fails the operation", async () => {
    const memory = memoryLockFs();

    await expect(
      withLocaleWriteLock(
        "/proj",
        "de",
        memory.fs,
        async () => {
          memory.put(LOCK, FOREIGN);
        },
        FAIL_FAST,
      ),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED", message: expect.stringContaining(LOCK) });

    expect(memory.content(LOCK)).toBe(FOREIGN);
  });

  it("reports the operation's own failure rather than the takeover", async () => {
    const memory = memoryLockFs();
    const boom = new Error("boom");

    await expect(
      withLocaleWriteLock(
        "/proj",
        "de",
        memory.fs,
        async () => {
          memory.put(LOCK, FOREIGN);
          throw boom;
        },
        FAIL_FAST,
      ),
    ).rejects.toBe(boom);

    expect(memory.content(LOCK)).toBe(FOREIGN);
  });

  it("reports a lock found gone at release as taken over when the operation succeeded", async () => {
    const memory = memoryLockFs();

    await expect(
      withLocaleWriteLock(
        "/proj",
        "de",
        memory.fs,
        async () => {
          memory.files.delete(LOCK);
          return "done";
        },
        FAIL_FAST,
      ),
    ).rejects.toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(`${LOCK} was taken over or removed`),
    });
  });

  it("reports a lock found gone at release as taken over on a file system without rename", async () => {
    const memory = memoryLockFs();
    const { rename: _rename, ...withoutRename } = memory.fs;

    await expect(
      withLocaleWriteLock(
        "/proj",
        "de",
        withoutRename,
        async () => {
          memory.files.delete(LOCK);
        },
        FAIL_FAST,
      ),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
  });

  it("reports a lock that vanishes between the release check and the move as taken over", async () => {
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.files.delete(LOCK);
      }),
    });

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(memory.files.size).toBe(0);
  });

  it("reports the operation's own failure when its lock is also gone at release", async () => {
    const memory = memoryLockFs();
    const boom = new Error("boom");

    await expect(
      withLocaleWriteLock(
        "/proj",
        "de",
        memory.fs,
        async () => {
          memory.files.delete(LOCK);
          throw boom;
        },
        FAIL_FAST,
      ),
    ).rejects.toBe(boom);
  });

  it("deletes a displaced record it cannot put back because a third process took the path", async () => {
    const third = record(LIVE_PID, { nonce: "third" });
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.put(LOCK, FOREIGN);
      }),
      afterRename: once(() => {
        memory.put(LOCK, third);
      }),
    });

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(memory.content(LOCK)).toBe(third);
    expect([...memory.files.keys()].filter((path) => ASIDE.test(path))).toEqual([]);
  });

  it("puts back a record that replaced its own between the check and the move", async () => {
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.put(LOCK, FOREIGN);
      }),
    });

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(memory.content(LOCK)).toBe(FOREIGN);
    expect([...memory.files.keys()].filter((path) => ASIDE.test(path))).toEqual([]);
  });

  it("falls back to deleting its own lock when the release rename fails", async () => {
    const memory = memoryLockFs(
      {},
      {
        rename: async () => {
          throw Object.assign(new Error("EXDEV"), { code: "EXDEV" });
        },
      },
    );

    await withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST);

    expect(memory.deleted).toEqual([LOCK]);
    expect(memory.files.size).toBe(0);
  });

  it("retries a release the file system reports as busy, then succeeds", async () => {
    let refusals = 0;
    const busy = (): NodeJS.ErrnoException => {
      refusals += 1;
      return Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    };
    const memory = memoryLockFs(
      {},
      {
        rename: async () => {
          throw busy();
        },
        deleteFile: async (path) => {
          if (refusals < 4) {
            throw busy();
          }
          memory.files.delete(path);
        },
      },
    );

    await withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST);

    expect(memory.files.size).toBe(0);
  });

  it("surfaces a release that stays busy after every retry", async () => {
    const busy = Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    const memory = memoryLockFs(
      {},
      {
        rename: async () => {
          throw busy;
        },
        deleteFile: async () => {
          throw busy;
        },
      },
    );

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toBe(busy);
  });

  it("surfaces a release failure that is not transient without retrying", async () => {
    const failure = Object.assign(new Error("EROFS"), { code: "EROFS" });
    let deletes = 0;
    const memory = memoryLockFs(
      {},
      {
        rename: async () => {
          throw failure;
        },
        deleteFile: async () => {
          deletes += 1;
          throw failure;
        },
      },
    );

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toBe(failure);
    expect(deletes).toBe(1);
  });

  it("compares before deleting on a file system without rename", async () => {
    const memory = memoryLockFs();
    const { rename: _rename, ...withoutRename } = memory.fs;

    await expect(
      withLocaleWriteLock(
        "/proj",
        "de",
        withoutRename,
        async () => {
          memory.put(LOCK, FOREIGN);
        },
        FAIL_FAST,
      ),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(memory.content(LOCK)).toBe(FOREIGN);

    memory.files.delete(LOCK);
    await withLocaleWriteLock("/proj", "de", withoutRename, async () => undefined, FAIL_FAST);
    expect(memory.deleted).toContain(LOCK);
    expect(memory.files.size).toBe(0);
  });
});

describe("releaseHeldLocks: a forced exit", () => {
  it("deletes its own in-flight lock, after which the operation writes nothing more", async () => {
    const written: string[] = [];
    const memory = memoryLockFs();
    const holder = gate();

    const held = withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        await holder.wait();
        await commit(written, "after exit");
      },
      FAIL_FAST,
    ).catch((error: unknown) => error);
    await holder.entered;
    await releaseHeldLocks();

    expect(memory.files.has(LOCK)).toBe(false);
    holder.open();
    expect(await held).toMatchObject({ code: "LOCK_CONTENDED" });
    expect(written).toEqual([]);
  });

  it("leaves a lock another process has taken over", async () => {
    const memory = memoryLockFs();
    const holder = gate();

    const held = withLocaleWriteLock("/proj", "de", memory.fs, () => holder.wait(), FAIL_FAST);
    await holder.entered;
    memory.put(LOCK, FOREIGN);
    await releaseHeldLocks();

    expect(memory.content(LOCK)).toBe(FOREIGN);
    holder.open();
    await held;
  });
});

describe("assertLocksHeld: the check before every protected write", () => {
  it("does nothing outside any lock", async () => {
    await expect(assertLocksHeld()).resolves.toBeUndefined();
  });

  it("passes while the lock file still holds this holder's token", async () => {
    const memory = memoryLockFs();

    await withLocaleWriteLock("/proj", "de", memory.fs, () => assertLocksHeld(), FAIL_FAST);
  });

  it("checks every lock the operation holds, outer ones included", async () => {
    const written: string[] = [];
    const memory = memoryLockFs();

    const outcome = await withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      () =>
        withLockFileGuard(
          "/proj",
          memory.fs,
          async () => {
            memory.put(LOCK, FOREIGN);
            await commit(written, "record");
          },
          FAIL_FAST,
        ),
      FAIL_FAST,
    ).catch((error: unknown) => error);

    expect(outcome).toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(LOCK),
    });
    expect(written).toEqual([]);
    expect(memory.files.has(lockFileGuardPath("/proj"))).toBe(false);
  });

  it("fails with the read error as its cause when the lock file cannot be read", async () => {
    const failure = Object.assign(new Error("EIO"), { code: "EIO" });
    const memory = memoryLockFs();
    let failReads = false;
    const fs: SdkFs = {
      ...memory.fs,
      readFileBounded: async (path, maxBytes) => {
        if (failReads) {
          throw failure;
        }
        return memory.fs.readFileBounded(path, maxBytes);
      },
    };

    const outcome = await withLocaleWriteLock(
      "/proj",
      "de",
      fs,
      async () => {
        failReads = true;
        try {
          await assertLocksHeld();
        } finally {
          failReads = false;
        }
      },
      FAIL_FAST,
    ).catch((error: unknown) => error);

    expect(outcome).toMatchObject({ code: "LOCK_CONTENDED", cause: failure });
  });
});

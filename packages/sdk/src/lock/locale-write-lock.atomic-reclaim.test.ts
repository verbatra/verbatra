import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BoundedFileRead, defaultFs, type SdkFs } from "../fs.js";
import { makeFakeFs, makeTempDir, memoryLockFs } from "../test-support.js";
import { identityTag, type LivenessContext } from "./holder-liveness.js";
import { localeLockPath, releaseHeldLocks, withLocaleWriteLock } from "./locale-write-lock.js";

const DEAD_PID = 999_101;
const SECOND_DEAD_PID = 999_102;
const LIVE_PID = 999_103;
const THIRD_LIVE_PID = 999_104;

const liveness: LivenessContext = {
  host: "test-host",
  probe: (pid) => {
    if (pid === DEAD_PID || pid === SECOND_DEAD_PID) {
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
const GUARD = `${LOCK}.reclaim`;
const LOCKS_DIR = dirname(LOCK);
const L1 = record(DEAD_PID);
const L2 = record(LIVE_PID);
const L3 = record(THIRD_LIVE_PID);
const G1 = record(SECOND_DEAD_PID);
const TAG = identityTag(liveness);

const ASIDE = /^(.+)\.(\d+)\.([0-9a-f]{12})\.[0-9a-f-]{36}\.stale$/;

function asides(files: ReadonlyMap<string, unknown>): string[] {
  return [...files.keys()].filter((path) => ASIDE.test(path));
}

function once(action: () => void): () => void {
  let done = false;
  return () => {
    if (!done) {
      done = true;
      action();
    }
  };
}

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: refused`), { code });
}

function renameOf(fs: SdkFs): (from: string, to: string) => Promise<void> {
  const rename = fs.rename;
  if (rename === undefined) {
    throw new Error("the memory file system always renames");
  }
  return rename;
}

const FAIL_FAST = { pollIntervalMs: 5, acquireTimeoutMs: 0, liveness };
const PATIENT = { pollIntervalMs: 5, acquireTimeoutMs: 60_000, liveness };

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await releaseHeldLocks();
});

describe("withLocaleWriteLock: reclaiming an abandoned lock with an atomic rename", () => {
  it("moves the abandoned lock aside under a unique name tagged with this machine, deletes only that", async () => {
    const memory = memoryLockFs();
    memory.put(LOCK, L1);
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
    const [from, to] = memory.renames[0] ?? ["", ""];
    expect(from).toBe(LOCK);
    expect(ASIDE.exec(to)?.slice(1)).toEqual([LOCK, String(process.pid), TAG]);
    expect(memory.deleted[0]).toBe(to);
    expect(memory.files.size).toBe(0);
  });

  it("gives every move a different aside name", async () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const memory = memoryLockFs();
      memory.put(LOCK, L1);
      await withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST);
      seen.add(memory.renames[0]?.[1] ?? "");
    }

    expect(seen.size).toBe(3);
  });

  it("puts back a live lock taken between the re-read and the rename, and keeps waiting", async () => {
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.put(LOCK, L2);
      }),
    });
    memory.put(LOCK, L1);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(memory.renames.map(([from]) => from).filter((from) => from === LOCK)).toEqual([LOCK]);
    expect(memory.content(LOCK)).toBe(L2);
    expect(asides(memory.files)).toEqual([]);
  });

  it("does nothing when another reclaimer removed the lock first, then takes the free path", async () => {
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.files.delete(LOCK);
      }),
    });
    memory.put(LOCK, L1);
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        ran = true;
      },
      PATIENT,
    );

    expect(ran).toBe(true);
    expect(memory.files.size).toBe(0);
  });

  it("deletes the displaced record when a third holder took the path before it could be put back", async () => {
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.put(LOCK, L2);
      }),
      afterRename: once(() => {
        memory.put(LOCK, L3);
      }),
    });
    memory.put(LOCK, L1);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(memory.content(LOCK)).toBe(L3);
    expect(asides(memory.files)).toEqual([]);
  });

  it("puts back a different abandoned record found under the name, since it is not the one observed", async () => {
    const replacement = record(DEAD_PID, { acquiredAt: "2026-02-01T00:00:00.000Z" });
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.put(LOCK, replacement);
      }),
    });
    memory.put(LOCK, L1);
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        ran = true;
      },
      PATIENT,
    );

    expect(ran).toBe(true);
    expect(memory.files.size).toBe(0);
  });

  it("leaves a displaced file it cannot read back aside rather than deleting it", async () => {
    let displaced = "";
    const memory = memoryLockFs(
      {
        afterRename: once(() => {
          displaced = memory.renames[0]?.[1] ?? "";
        }),
      },
      {
        readFileBounded: async (path): Promise<BoundedFileRead> => {
          if (path === displaced) {
            return { kind: "too-large" };
          }
          const content = memory.content(path);
          return content === undefined ? { kind: "missing" } : { kind: "ok", content };
        },
      },
    );
    memory.put(LOCK, L1);
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        ran = true;
      },
      PATIENT,
    );

    expect(ran).toBe(true);
    expect(memory.content(displaced)).toBe(L1);
    expect(memory.deleted).not.toContain(displaced);
  });

  it("does nothing more when the moved file vanished before it could be read back", async () => {
    const memory = memoryLockFs({
      afterRename: once(() => {
        const moved = memory.renames[0]?.[1] ?? "";
        memory.files.delete(moved);
        memory.put(LOCK, L2);
      }),
    });
    memory.put(LOCK, L1);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(memory.content(LOCK)).toBe(L2);
    expect(asides(memory.files)).toEqual([]);
  });

  it("still takes the lock when the moved-aside record cannot be deleted", async () => {
    const memory = memoryLockFs(
      {},
      {
        deleteFile: async (path) => {
          if (ASIDE.test(path)) {
            throw errno("EROFS");
          }
          memory.files.delete(path);
        },
      },
    );
    memory.put(LOCK, L1);
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
    expect(asides(memory.files).length).toBeGreaterThanOrEqual(1);
  });

  it("swallows a failed delete of the aside after putting a displaced lock back", async () => {
    const memory = memoryLockFs(
      {
        beforeRename: once(() => {
          memory.put(LOCK, L2);
        }),
      },
      {
        deleteFile: async (path) => {
          if (ASIDE.test(path)) {
            throw errno("EPERM");
          }
          memory.files.delete(path);
        },
      },
    );
    memory.put(LOCK, L1);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.not.stringContaining("EPERM"),
    });

    expect(memory.content(LOCK)).toBe(L2);
    const left = asides(memory.files).filter((path) => ASIDE.exec(path)?.[1] === LOCK);
    expect(left).toHaveLength(1);
    expect(memory.content(left[0] ?? "")).toBe(L2);
  });

  it("maps a rename error that is not transient to LOCK_CONTENDED at once, naming the lock", async () => {
    const refusal = errno("EROFS");
    const memory = memoryLockFs(
      {},
      {
        rename: async () => {
          throw refusal;
        },
      },
    );
    memory.put(LOCK, L1);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, PATIENT),
    ).rejects.toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(`Could not reclaim the abandoned write lock at ${LOCK}`),
      cause: refusal,
    });
    expect(memory.content(LOCK)).toBe(L1);
    expect(memory.files.has(GUARD)).toBe(false);
  });

  it("lets exactly one of many racing contenders in when every reclaim goes through rename", async () => {
    const memory = memoryLockFs();
    memory.put(LOCK, L1);
    let inside = 0;
    let maxInside = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        withLocaleWriteLock(
          "/proj",
          "de",
          memory.fs,
          async () => {
            inside += 1;
            maxInside = Math.max(maxInside, inside);
            await new Promise((res) => setTimeout(res, 2));
            inside -= 1;
          },
          { pollIntervalMs: 1, acquireTimeoutMs: 60_000, liveness },
        ),
      ),
    );

    expect(maxInside).toBe(1);
    expect(asides(memory.files)).toEqual([]);
  });
});

describe("withLocaleWriteLock: a rename Windows refuses while another process has the file open", () => {
  it("treats a busy rename as not reclaimed this poll and reclaims on a later one", async () => {
    const memory = memoryLockFs();
    memory.put(LOCK, L1);
    const rename = renameOf(memory.fs);
    const busy = once(() => {
      throw errno("EBUSY");
    });
    const fs: SdkFs = {
      ...memory.fs,
      rename: async (from, to) => {
        busy();
        await rename(from, to);
      },
    };
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      fs,
      async () => {
        ran = true;
      },
      PATIENT,
    );

    expect(ran).toBe(true);
    expect(memory.files.size).toBe(0);
  });

  it.each(["EPERM", "EBUSY", "EACCES"])(
    "keeps polling past a persistent %s and times out naming the file and the last refusal",
    async (code) => {
      const refusal = errno(code);
      const memory = memoryLockFs(
        {},
        {
          rename: async () => {
            throw refusal;
          },
        },
      );
      memory.put(LOCK, L1);
      let attempts = 0;
      const fs: SdkFs = {
        ...memory.fs,
        rename: async () => {
          attempts += 1;
          throw refusal;
        },
      };

      await expect(
        withLocaleWriteLock("/proj", "de", fs, async () => undefined, {
          ...PATIENT,
          acquireTimeoutMs: 40,
        }),
      ).rejects.toMatchObject({
        code: "LOCK_CONTENDED",
        message: expect.stringContaining(`Moving the abandoned file ${LOCK} aside last failed`),
        cause: refusal,
      });
      expect(attempts).toBeGreaterThan(1);
      expect(memory.content(LOCK)).toBe(L1);
      expect(memory.files.has(GUARD)).toBe(false);
    },
  );

  it("names the reclaim guard when it is the guard whose rename is refused", async () => {
    const refusal = errno("EACCES");
    const memory = memoryLockFs(
      {},
      {
        rename: async () => {
          throw refusal;
        },
      },
    );
    memory.put(LOCK, L1);
    memory.put(GUARD, record(LIVE_PID, { heartbeatMs: 1_000 }), Date.now() - 60_000);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(`Moving the abandoned file ${GUARD} aside last failed`),
      cause: refusal,
    });
  });
});

describe("withLocaleWriteLock: clearing an abandoned reclaim guard with an atomic rename", () => {
  const POLL = 100;

  function useDeterministicPolls(): void {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    vi.setSystemTime(1_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0);
  }

  it("does not clear a dead reclaimer's guard in the poll that first sees it, only on a later identical sighting", async () => {
    useDeterministicPolls();
    const memory = memoryLockFs();
    memory.put(LOCK, L1);
    memory.put(GUARD, G1);

    const acquisition = withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, {
      pollIntervalMs: POLL,
      acquireTimeoutMs: 60_000,
      liveness,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(memory.content(GUARD)).toBe(G1);
    expect(memory.renames).toEqual([]);

    await vi.advanceTimersByTimeAsync(POLL);
    expect(memory.files.has(GUARD)).toBe(false);
    expect(memory.renames.map(([from]) => from)).toEqual([GUARD]);
    expect(memory.content(LOCK)).toBe(L1);

    await vi.advanceTimersByTimeAsync(POLL);
    await acquisition;
    expect(memory.renames.map(([from]) => from).slice(0, 2)).toEqual([GUARD, LOCK]);
    expect(memory.files.size).toBe(0);
  });

  it("starts the count over when the dead guard is replaced by another dead one", async () => {
    useDeterministicPolls();
    const memory = memoryLockFs();
    memory.put(LOCK, L1);
    memory.put(GUARD, G1);

    void withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, {
      pollIntervalMs: POLL,
      acquireTimeoutMs: 60_000,
      liveness,
    }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    memory.put(GUARD, record(DEAD_PID, { acquiredAt: "2026-03-01T00:00:00.000Z" }));
    await vi.advanceTimersByTimeAsync(POLL);

    expect(memory.renames).toEqual([]);
    expect(memory.files.has(GUARD)).toBe(true);
  });

  it("clears a guard whose heartbeat is stale in the poll that first sees it", async () => {
    const memory = memoryLockFs();
    memory.put(LOCK, L1);
    memory.put(GUARD, record(LIVE_PID, { heartbeatMs: 1_000 }), Date.now() - 3_000);
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      memory.fs,
      async () => {
        ran = true;
      },
      PATIENT,
    );

    expect(ran).toBe(true);
    expect(memory.renames[0]?.[0]).toBe(GUARD);
    expect(memory.files.size).toBe(0);
  });

  it("never touches a guard a live process holds while its heartbeat is fresh", async () => {
    const memory = memoryLockFs();
    const guard = record(LIVE_PID, { heartbeatMs: 1_000 });
    memory.put(LOCK, L1);
    memory.put(GUARD, guard);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, {
        ...PATIENT,
        acquireTimeoutMs: 30,
      }),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(memory.renames).toEqual([]);
    expect(memory.content(GUARD)).toBe(guard);
    expect(memory.content(LOCK)).toBe(L1);
  });

  it("puts back a fresh guard another waiter took between the re-read and the rename", async () => {
    const g2 = record(LIVE_PID);
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.put(GUARD, g2);
      }),
    });
    memory.put(LOCK, L1);
    memory.put(GUARD, record(LIVE_PID, { heartbeatMs: 1_000 }), Date.now() - 10_000);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(memory.content(GUARD)).toBe(g2);
    expect(memory.content(LOCK)).toBe(L1);
    expect(asides(memory.files)).toEqual([]);
  });

  it("keeps a third waiter's guard that took the path while a fresh guard was aside", async () => {
    const g3 = record(THIRD_LIVE_PID);
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.put(GUARD, record(LIVE_PID));
      }),
      afterRename: once(() => {
        memory.put(GUARD, g3);
      }),
    });
    memory.put(LOCK, L1);
    memory.put(GUARD, record(LIVE_PID, { heartbeatMs: 1_000 }), Date.now() - 10_000);

    await expect(
      withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(memory.content(GUARD)).toBe(g3);
    expect(memory.content(LOCK)).toBe(L1);
    expect(asides(memory.files)).toEqual([]);
  });

  it("does nothing when another waiter cleared the guard first", async () => {
    const memory = memoryLockFs({
      beforeRename: once(() => {
        memory.files.delete(GUARD);
      }),
    });
    memory.put(LOCK, L1);
    memory.put(GUARD, record(LIVE_PID, { heartbeatMs: 1_000 }), Date.now() - 10_000);

    await withLocaleWriteLock("/proj", "de", memory.fs, async () => undefined, PATIENT);

    expect(memory.renames[0]?.[0]).toBe(LOCK);
    expect(memory.files.size).toBe(0);
  });
});

describe("withLocaleWriteLock: sweeping moved-aside files", () => {
  const STALE_AFTER_MS = 3_000;
  const options = { ...FAIL_FAST, heartbeatIntervalMs: 1_000 };
  const foreignTag = "0123456789ab";

  function asideOf(path: string, pid: number, tag: string): string {
    return `${path}.${pid}.${tag}.00000000-0000-4000-8000-000000000000.stale`;
  }

  it("deletes an aside whose mover on this machine is gone", async () => {
    const memory = memoryLockFs();
    const aside = asideOf(LOCK, DEAD_PID, TAG);
    memory.put(aside, L2);

    await withLocaleWriteLock("/proj", "fr", memory.fs, async () => undefined, options);

    expect(memory.files.has(aside)).toBe(false);
  });

  it("deletes an aside of a reclaim guard older than the stale threshold, whoever moved it", async () => {
    const memory = memoryLockFs();
    const aside = asideOf(GUARD, LIVE_PID, foreignTag);
    memory.put(aside, L2, Date.now() - STALE_AFTER_MS);

    await withLocaleWriteLock("/proj", "fr", memory.fs, async () => undefined, options);

    expect(memory.files.has(aside)).toBe(false);
  });

  it.each([
    ["a live mover on this machine", asideOf(LOCK, LIVE_PID, TAG)],
    ["a mover on another machine, however its pid looks here", asideOf(LOCK, DEAD_PID, foreignTag)],
  ])("keeps a fresh aside left by %s", async (_label, aside) => {
    const memory = memoryLockFs();
    memory.put(aside, L2);

    await withLocaleWriteLock("/proj", "fr", memory.fs, async () => undefined, options);

    expect(memory.content(aside)).toBe(L2);
  });

  it("leaves files that are not asides, and directories with an aside's name, alone", async () => {
    const aside = asideOf(LOCK, DEAD_PID, TAG);
    const memory = memoryLockFs(
      {},
      {
        readDirectory: async () => [
          { name: "notes.txt", kind: "file" },
          { name: aside.slice(LOCKS_DIR.length + 1), kind: "directory" },
        ],
      },
    );
    memory.put(`${LOCKS_DIR}/notes.txt`, "keep");
    memory.put(aside, L2);

    await withLocaleWriteLock("/proj", "fr", memory.fs, async () => undefined, options);

    expect(memory.content(`${LOCKS_DIR}/notes.txt`)).toBe("keep");
    expect(memory.content(aside)).toBe(L2);
  });

  it("keeps an old aside when the file system cannot report modification times", async () => {
    const memory = memoryLockFs();
    const { mtimeMs: _mtimeMs, ...withoutMtime } = memory.fs;
    const aside = asideOf(LOCK, LIVE_PID, foreignTag);
    memory.put(aside, L2, 0);

    await withLocaleWriteLock("/proj", "fr", withoutMtime, async () => undefined, options);

    expect(memory.content(aside)).toBe(L2);
  });

  it("keeps an aside whose modification time cannot be read", async () => {
    const memory = memoryLockFs(
      {},
      {
        mtimeMs: async () => {
          throw errno("EIO");
        },
      },
    );
    const aside = asideOf(LOCK, LIVE_PID, foreignTag);
    memory.put(aside, L2, 0);

    await withLocaleWriteLock("/proj", "fr", memory.fs, async () => undefined, options);

    expect(memory.content(aside)).toBe(L2);
  });

  it("still takes the lock when an aside cannot be deleted", async () => {
    const aside = asideOf(LOCK, DEAD_PID, TAG);
    const memory = memoryLockFs(
      {},
      {
        deleteFile: async (path) => {
          if (path === aside) {
            throw errno("EPERM");
          }
          memory.files.delete(path);
        },
      },
    );
    memory.put(aside, L2);
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "fr",
      memory.fs,
      async () => {
        ran = true;
      },
      options,
    );

    expect(ran).toBe(true);
    expect(memory.content(aside)).toBe(L2);
  });

  it.each<[string, Partial<SdkFs>]>([
    ["cannot list directories", {}],
    [
      "fails to list the locks directory",
      {
        readDirectory: async () => {
          throw errno("ENOENT");
        },
      },
    ],
  ])("takes the lock on a file system that %s", async (_label, overrides) => {
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "fr",
      makeFakeFs(overrides),
      async () => {
        ran = true;
      },
      options,
    );

    expect(ran).toBe(true);
  });
});

describe("withLocaleWriteLock: reclaiming through the default file system", () => {
  it("leaves no lock, guard, or moved-aside file behind in the locks directory", async () => {
    const cwd = await makeTempDir();
    const path = localeLockPath(cwd, "de");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, L1, "utf8");
    await writeFile(`${path}.reclaim`, G1, "utf8");
    let ran = false;

    try {
      await withLocaleWriteLock(
        cwd,
        "de",
        defaultFs,
        async () => {
          ran = true;
        },
        PATIENT,
      );

      expect(ran).toBe(true);
      expect(await readdir(dirname(path))).toEqual([]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

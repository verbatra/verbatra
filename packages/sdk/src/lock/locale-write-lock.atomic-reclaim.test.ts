import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BoundedFileRead, defaultFs, type SdkFs } from "../fs.js";
import { makeFakeFs, makeTempDir } from "../test-support.js";
import type { LivenessContext } from "./holder-liveness.js";
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

function record(pid: number): string {
  return JSON.stringify({ pid, hostname: liveness.host, acquiredAt: "2026-01-01T00:00:00.000Z" });
}

const LOCK = localeLockPath("/proj", "de");
const GUARD = `${LOCK}.reclaim`;
const L1 = record(DEAD_PID);
const L2 = record(LIVE_PID);
const L3 = record(THIRD_LIVE_PID);
const G1 = record(SECOND_DEAD_PID);

const ASIDE = /^(.+)\.(\d+)\.[0-9a-f-]{36}\.stale$/;

interface Hooks {
  beforeRename?: (from: string) => void;
  afterRename?: (from: string, to: string) => void;
}

interface RenamingFs {
  readonly fs: SdkFs;
  readonly renames: [string, string][];
  readonly deleted: string[];
}

function renamingFs(
  files: Map<string, string>,
  hooks: Hooks = {},
  overrides: Partial<SdkFs> = {},
): RenamingFs {
  const renames: [string, string][] = [];
  const deleted: string[] = [];
  const fs = makeFakeFs({
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
      deleted.push(path);
      files.delete(path);
    },
    rename: async (from, to) => {
      hooks.beforeRename?.(from);
      const content = files.get(from);
      if (content === undefined) {
        throw Object.assign(new Error(`no such file: ${from}`), { code: "ENOENT" });
      }
      files.delete(from);
      files.set(to, content);
      renames.push([from, to]);
      hooks.afterRename?.(from, to);
    },
    ...overrides,
  });
  return { fs, renames, deleted };
}

function asides(files: ReadonlyMap<string, string>): string[] {
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

const FAIL_FAST = { pollIntervalMs: 5, acquireTimeoutMs: 0, liveness };
const PATIENT = { pollIntervalMs: 5, acquireTimeoutMs: 60_000, liveness };

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await releaseHeldLocks();
});

describe("withLocaleWriteLock: reclaiming an abandoned lock with an atomic rename", () => {
  it("moves the abandoned lock aside under a unique sibling name and deletes only that", async () => {
    const files = new Map([[LOCK, L1]]);
    const { fs, renames, deleted } = renamingFs(files);
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      fs,
      async () => {
        ran = true;
      },
      FAIL_FAST,
    );

    expect(ran).toBe(true);
    expect(renames).toHaveLength(1);
    const [from, to] = renames[0] ?? ["", ""];
    expect(from).toBe(LOCK);
    expect(to).toMatch(ASIDE);
    expect(ASIDE.exec(to)?.[1]).toBe(LOCK);
    expect(ASIDE.exec(to)?.[2]).toBe(String(process.pid));
    expect(deleted).toEqual([to, GUARD, LOCK]);
    expect(files.size).toBe(0);
  });

  it("gives every move a different aside name", async () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const files = new Map([[LOCK, L1]]);
      const { fs, renames } = renamingFs(files);
      await withLocaleWriteLock("/proj", "de", fs, async () => undefined, FAIL_FAST);
      seen.add(renames[0]?.[1] ?? "");
    }

    expect(seen.size).toBe(3);
  });

  it("puts back a live lock taken between the re-read and the rename, and keeps waiting", async () => {
    const files = new Map([[LOCK, L1]]);
    const { fs, renames, deleted } = renamingFs(files, {
      beforeRename: once(() => {
        files.set(LOCK, L2);
      }),
    });

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(renames.map(([from]) => from)).toEqual([LOCK]);
    expect(files.get(LOCK)).toBe(L2);
    expect(asides(files)).toEqual([]);
    expect(deleted).not.toContain(LOCK);
  });

  it("does nothing when another reclaimer removed the lock first, then takes the free path", async () => {
    const files = new Map([[LOCK, L1]]);
    const { fs, renames } = renamingFs(files, {
      beforeRename: once(() => {
        files.delete(LOCK);
      }),
    });
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
    expect(renames).toEqual([]);
    expect(files.size).toBe(0);
  });

  it("keeps a third holder that took the path while a live lock was aside, and deletes neither", async () => {
    const files = new Map([[LOCK, L1]]);
    const { fs, deleted } = renamingFs(files, {
      beforeRename: once(() => {
        files.set(LOCK, L2);
      }),
      afterRename: once(() => {
        files.set(LOCK, L3);
      }),
    });

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(files.get(LOCK)).toBe(L3);
    const left = asides(files);
    expect(left).toHaveLength(1);
    expect(files.get(left[0] ?? "")).toBe(L2);
    expect(deleted).toEqual([GUARD]);
  });

  it("puts back a different abandoned record found under the name, since it is not the one observed", async () => {
    const replacement = JSON.stringify({
      ...JSON.parse(L1),
      acquiredAt: "2026-02-01T00:00:00.000Z",
    });
    const files = new Map([[LOCK, L1]]);
    const { fs } = renamingFs(files, {
      beforeRename: once(() => {
        files.set(LOCK, replacement);
      }),
    });
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
    expect(files.size).toBe(0);
  });

  it("leaves a displaced file it cannot read back aside rather than deleting it", async () => {
    const files = new Map([[LOCK, L1]]);
    let displaced = "";
    const { fs, deleted } = renamingFs(
      files,
      {
        afterRename: (_from, to) => {
          displaced = to;
        },
      },
      {
        readFileBounded: async (path): Promise<BoundedFileRead> => {
          if (path === displaced) {
            return { kind: "too-large" };
          }
          const content = files.get(path);
          return content === undefined ? { kind: "missing" } : { kind: "ok", content };
        },
      },
    );
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
    expect(files.get(displaced)).toBe(L1);
    expect(deleted).not.toContain(displaced);
  });

  it("still takes the lock when the moved-aside record cannot be deleted", async () => {
    const files = new Map([[LOCK, L1]]);
    const { fs } = renamingFs(
      files,
      {},
      {
        deleteFile: async (path) => {
          if (ASIDE.test(path)) {
            throw Object.assign(new Error("read-only"), { code: "EROFS" });
          }
          files.delete(path);
        },
      },
    );
    let ran = false;

    await withLocaleWriteLock(
      "/proj",
      "de",
      fs,
      async () => {
        ran = true;
      },
      FAIL_FAST,
    );

    expect(ran).toBe(true);
    expect(asides(files)).toHaveLength(1);
  });

  it("maps a rename the file system refuses to LOCK_CONTENDED naming the lock", async () => {
    const refusal = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const files = new Map([[LOCK, L1]]);
    const { fs } = renamingFs(
      files,
      {},
      {
        rename: async () => {
          throw refusal;
        },
      },
    );

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(LOCK),
      cause: refusal,
    });
    expect(files.get(LOCK)).toBe(L1);
    expect(files.has(GUARD)).toBe(false);
  });

  it("lets exactly one of many racing contenders in when every reclaim goes through rename", async () => {
    const files = new Map([[LOCK, L1]]);
    const { fs } = renamingFs(files);
    let inside = 0;
    let maxInside = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        withLocaleWriteLock(
          "/proj",
          "de",
          fs,
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
    expect(asides(files)).toEqual([]);
  });
});

describe("withLocaleWriteLock: clearing an abandoned reclaim guard with an atomic rename", () => {
  const POLL = 100;

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

  it("clears the guard in the poll that first sees it, without a second sighting", async () => {
    useDeterministicPolls();
    const files = new Map([
      [LOCK, L1],
      [GUARD, G1],
    ]);
    const { fs, renames } = renamingFs(files);

    const acquisition = withLocaleWriteLock("/proj", "de", fs, async () => undefined, {
      pollIntervalMs: POLL,
      acquireTimeoutMs: 60_000,
      liveness,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(files.has(GUARD)).toBe(false);
    expect(renames.map(([from]) => from)).toEqual([GUARD]);
    expect(files.get(LOCK)).toBe(L1);

    await vi.advanceTimersByTimeAsync(POLL);
    await acquisition;
    expect(renames.map(([from]) => from)).toEqual([GUARD, LOCK]);
    expect(files.size).toBe(0);
  });

  it("puts back a fresh guard another waiter took between the re-read and the rename", async () => {
    const g2 = record(LIVE_PID);
    const files = new Map([
      [LOCK, L1],
      [GUARD, G1],
    ]);
    const { fs, deleted } = renamingFs(files, {
      beforeRename: once(() => {
        files.set(GUARD, g2);
      }),
    });

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(files.get(GUARD)).toBe(g2);
    expect(files.get(LOCK)).toBe(L1);
    expect(asides(files)).toEqual([]);
    expect(deleted).not.toContain(GUARD);
  });

  it("keeps a third waiter's guard when it took the path while a fresh guard was aside", async () => {
    const g2 = record(LIVE_PID);
    const g3 = record(THIRD_LIVE_PID);
    const files = new Map([
      [LOCK, L1],
      [GUARD, G1],
    ]);
    const { fs } = renamingFs(files, {
      beforeRename: once(() => {
        files.set(GUARD, g2);
      }),
      afterRename: once(() => {
        files.set(GUARD, g3);
      }),
    });

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, FAIL_FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(files.get(GUARD)).toBe(g3);
    const left = asides(files);
    expect(left).toHaveLength(1);
    expect(files.get(left[0] ?? "")).toBe(g2);
    expect(files.get(LOCK)).toBe(L1);
  });

  it("does nothing when another waiter cleared the guard first", async () => {
    const files = new Map([
      [LOCK, L1],
      [GUARD, G1],
    ]);
    const { fs, renames } = renamingFs(files, {
      beforeRename: once(() => {
        files.delete(GUARD);
      }),
    });

    await withLocaleWriteLock("/proj", "de", fs, async () => undefined, PATIENT);

    expect(renames.map(([from]) => from)).toEqual([LOCK]);
    expect(files.size).toBe(0);
  });

  it("never touches a guard a live process holds", async () => {
    const g2 = record(LIVE_PID);
    const files = new Map([
      [LOCK, L1],
      [GUARD, g2],
    ]);
    const { fs, renames } = renamingFs(files);

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, {
        ...FAIL_FAST,
        acquireTimeoutMs: 30,
      }),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(renames).toEqual([]);
    expect(files.get(GUARD)).toBe(g2);
    expect(files.get(LOCK)).toBe(L1);
  });

  it("maps a rename of the guard the file system refuses to LOCK_CONTENDED naming the guard", async () => {
    const refusal = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const files = new Map([
      [LOCK, L1],
      [GUARD, G1],
    ]);
    const { fs } = renamingFs(
      files,
      {},
      {
        rename: async () => {
          throw refusal;
        },
      },
    );

    await expect(
      withLocaleWriteLock("/proj", "de", fs, async () => undefined, PATIENT),
    ).rejects.toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(GUARD),
      cause: refusal,
    });
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

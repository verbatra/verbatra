import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { makeFakeFs, makeTempDir } from "../test-support.js";
import type { LivenessContext } from "./holder-liveness.js";
import { localeLockPath, releaseHeldLocks, withLocaleWriteLock } from "./locale-write-lock.js";

function deadPid(): number {
  const child = spawnSync(process.execPath, ["-e", ""]);
  return child.pid;
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

const FAST = { pollIntervalMs: 5, acquireTimeoutMs: 300 };

let cwd: string;

beforeEach(async () => {
  cwd = await makeTempDir();
});

afterEach(async () => {
  await releaseHeldLocks();
  await rm(cwd, { recursive: true, force: true });
});

describe("withLocaleWriteLock: abandoned lock reclaim", () => {
  it("reclaims a lock whose holder pid is no longer running on this host and runs the callback", async () => {
    const path = localeLockPath(cwd, "de");
    await plantLock(path, {
      pid: deadPid(),
      hostname: hostname(),
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

  it("records the pid and host name of the new holder", async () => {
    const path = localeLockPath(cwd, "de");
    let content = "";

    await withLocaleWriteLock(cwd, "de", defaultFs, async () => {
      content = await readFile(path, "utf8");
    });

    expect(JSON.parse(content)).toMatchObject({ pid: process.pid, hostname: hostname() });
  });

  it.each([
    ["a live holder on this host", () => ({ pid: process.pid, hostname: hostname() })],
    ["a dead pid recorded by another host", () => ({ pid: deadPid(), hostname: "elsewhere" })],
    ["a lock written without a host name", () => ({ pid: deadPid() })],
  ])("keeps waiting, then fails with LOCK_CONTENDED, for %s", async (_label, payload) => {
    const path = localeLockPath(cwd, "de");
    const planted = await plantLock(path, payload());

    await expect(
      withLocaleWriteLock(cwd, "de", defaultFs, async () => undefined, FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(await readFile(path, "utf8")).toBe(planted);
  });

  it("lets exactly one of many racing contenders into the critical section at a time", async () => {
    await plantLock(localeLockPath(cwd, "de"), { pid: deadPid(), hostname: hostname() });
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
          { pollIntervalMs: 2, acquireTimeoutMs: 60_000 },
        ),
      ),
    );

    expect(maxInside).toBe(1);
  });

  it("clears a reclaim guard left by a dead reclaimer, then reclaims the lock", async () => {
    const path = localeLockPath(cwd, "de");
    await plantLock(path, { pid: deadPid(), hostname: hostname() });
    await plantLock(`${path}.reclaim`, { pid: deadPid(), hostname: hostname() });

    await withLocaleWriteLock(cwd, "de", defaultFs, async () => undefined, {
      pollIntervalMs: 2,
      acquireTimeoutMs: 60_000,
    });

    expect(await exists(path)).toBe(false);
    expect(await exists(`${path}.reclaim`)).toBe(false);
  });

  it("does not reclaim while a live process holds the reclaim guard", async () => {
    const path = localeLockPath(cwd, "de");
    const planted = await plantLock(path, { pid: deadPid(), hostname: hostname() });
    await plantLock(`${path}.reclaim`, { pid: process.pid, hostname: hostname() });

    await expect(
      withLocaleWriteLock(cwd, "de", defaultFs, async () => undefined, FAST),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(await readFile(path, "utf8")).toBe(planted);
  });

  it("leaves the lock alone when its content changed between the liveness check and the reclaim", async () => {
    const liveness: LivenessContext = {
      host: "h",
      probe: () => {
        throw Object.assign(new Error("gone"), { code: "ESRCH" });
      },
    };
    const deleted: string[] = [];
    let reads = 0;
    const fs: SdkFs = makeFakeFs({
      createExclusive: async (path) => path.endsWith(".reclaim"),
      readFileBounded: async () => {
        reads += 1;
        const pid = reads === 1 ? 11 : 22;
        return { kind: "ok", content: JSON.stringify({ pid, hostname: "h" }) };
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
    expect(deleted).toEqual([`${localeLockPath("/proj", "de")}.reclaim`]);
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

    const successor = await plantLock(path, { pid: process.pid, hostname: hostname() });
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

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs } from "../fs.js";
import {
  type LockWaitEvent,
  localeLockPath,
  lockFileGuardPath,
} from "../lock/locale-write-lock.js";
import { lockFilePath } from "../lock/lock-file.js";
import { provenanceFilePath } from "../lock/provenance-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import type { LocaleSummary } from "./summary.js";
import { translate } from "./translate-project.js";

function localeSummary(locales: readonly LocaleSummary[], locale: string): LocaleSummary {
  const summary = locales.find((entry) => entry.locale === locale);
  if (summary === undefined) {
    throw new Error(`no summary for locale ${locale}`);
  }
  return summary;
}

async function holdLockAt(path: string, payload: Record<string, unknown>): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload), "utf8");
  return path;
}

function foreignHolder(pid: number): Record<string, unknown> {
  return { pid, acquiredAt: "2026-07-18T00:00:00.000Z" };
}

async function projectWithSource(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  return dir;
}

function releaseAfter(path: string, ms: number): Promise<void> {
  return new Promise((res, rej) => {
    setTimeout(() => {
      rm(path, { force: true }).then(res, rej);
    }, ms);
  });
}

describe("translate: lockAcquireTimeoutMs bounds the locale write lock taken before any provider call", () => {
  it("fails the contended locale fast with no provider call, no file write, and no lock record", async () => {
    const dir = await projectWithSource();
    const lockPath = await holdLockAt(localeLockPath(dir, "de"), foreignHolder(9999));
    const { provider, calls } = makeStubProvider();

    const events: LockWaitEvent[] = [];
    const summary = await translate(
      {
        config: baseConfig({ targetLocales: ["de"] }),
        cwd: dir,
        onLockWait: (event) => events.push(event),
        lockAcquireTimeoutMs: 50,
      },
      { createProvider: () => provider },
    );

    const de = localeSummary(summary.locales, "de");
    expect(de.status).toBe("failed");
    expect(de.error).toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(lockPath),
    });
    expect(calls).toHaveLength(0);
    expect(await defaultFs.fileExists(join(dir, "locales", "de.json"))).toBe(false);
    expect(await defaultFs.fileExists(lockFilePath(dir))).toBe(false);
    expect(await defaultFs.fileExists(provenanceFilePath(dir))).toBe(false);
  });
});

describe("translate: the record step after the target is written ignores lockAcquireTimeoutMs", () => {
  it("records the lock, provenance, and usage when the lock-file guard is held past the timeout", async () => {
    const dir = await projectWithSource();
    const guardPath = await holdLockAt(lockFileGuardPath(dir), foreignHolder(9999));
    const { provider, calls } = makeStubProvider({ usage: { inputTokens: 7, outputTokens: 3 } });
    const release = releaseAfter(guardPath, 400);

    const summary = await translate(
      { config: baseConfig({ targetLocales: ["de"] }), cwd: dir, lockAcquireTimeoutMs: 50 },
      { createProvider: () => provider },
    );
    await release;

    const de = localeSummary(summary.locales, "de");
    expect(de.status).toBe("succeeded");
    expect(de.translated).toEqual(["greeting"]);
    expect(de.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
    expect(calls).toHaveLength(1);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      greeting: "[de] Hello",
    });
    expect(await readJsonFile(lockFilePath(dir))).toMatchObject({
      locales: { de: { greeting: expect.any(String) } },
    });
    expect(await readJsonFile(provenanceFilePath(dir))).toMatchObject({
      locales: { de: { greeting: expect.objectContaining({ origin: expect.any(String) }) } },
    });
  });
});

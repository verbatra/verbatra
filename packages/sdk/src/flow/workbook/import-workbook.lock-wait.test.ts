import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { buildDelimited, readDelimited } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import { defaultFs } from "../../fs.js";
import { currentHostLiveness } from "../../lock/holder-liveness.js";
import {
  type LockWaitEvent,
  localeLockPath,
  lockFileGuardPath,
} from "../../lock/locale-write-lock.js";
import { lockFilePath } from "../../lock/lock-file.js";
import { provenanceFilePath } from "../../lock/provenance-file.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../../test-support.js";
import type { LocaleSummary } from "../summary.js";
import { exportWorkbook } from "./export-workbook.js";
import { importWorkbook } from "./import-workbook.js";

const config = () => baseConfig({ targetLocales: ["de"], format: "i18next-json" });

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

function selfHolder(): Record<string, unknown> {
  const liveness = currentHostLiveness();
  return {
    pid: process.pid,
    hostname: liveness.host,
    ...(liveness.bootId !== undefined ? { bootId: liveness.bootId } : {}),
    ...(liveness.pidNamespace !== undefined ? { pidNamespace: liveness.pidNamespace } : {}),
    acquiredAt: "2026-07-18T00:00:00.000Z",
  };
}

function releaseAfter(path: string, ms: number): Promise<void> {
  return new Promise((res, rej) => {
    setTimeout(() => {
      rm(path, { force: true }).then(res, rej);
    }, ms);
  });
}

async function filledHandoff(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  await exportWorkbook({ config: config(), cwd: dir, format: "csv", out: "handoff" });
  const path = join(dir, "handoff", "de.csv");
  const data = readDelimited({ text: await readFile(path, "utf8"), locale: "de", format: "csv" });
  const rows = (data.sheets[0]?.rows ?? []).map((row) => ({ ...row, translation: "Hallo" }));
  await writeFile(path, buildDelimited({ locale: "de", rows }, "csv"), "utf8");
  return dir;
}

describe("importWorkbook: lockAcquireTimeoutMs bounds the locale write lock taken before any file write", () => {
  it("fails the contended locale fast with no file write and no lock record", async () => {
    const dir = await filledHandoff();
    const lockPath = await holdLockAt(localeLockPath(dir, "de"), foreignHolder(9999));

    const events: LockWaitEvent[] = [];
    const summary = await importWorkbook({
      config: config(),
      cwd: dir,
      workbook: "handoff",
      format: "csv",
      onLockWait: (event) => events.push(event),
      lockAcquireTimeoutMs: 1_300,
    });

    const de = localeSummary(summary.locales, "de");
    expect(de.status).toBe("failed");
    expect(de.error).toMatchObject({
      code: "LOCK_CONTENDED",
      message: expect.stringContaining(`at ${relative(dir, lockPath)}`),
    });
    expect(summary.failed).toEqual(["de"]);
    expect(await defaultFs.fileExists(join(dir, "locales", "de.json"))).toBe(false);
    expect(await defaultFs.fileExists(lockFilePath(dir))).toBe(false);
    expect(await defaultFs.fileExists(provenanceFilePath(dir))).toBe(false);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toMatchObject({ lockPath, holder: { pid: 9999 } });
    expect(events[0]?.elapsedMs).toBeGreaterThanOrEqual(1_000);
  });

  it("takes no lock on a dry run, so a held lock neither fails nor delays it", async () => {
    const dir = await filledHandoff();
    await holdLockAt(localeLockPath(dir, "de"), foreignHolder(9999));

    const events: LockWaitEvent[] = [];
    const summary = await importWorkbook({
      config: config(),
      cwd: dir,
      workbook: "handoff",
      format: "csv",
      dryRun: true,
      onLockWait: (event) => events.push(event),
      lockAcquireTimeoutMs: 1_000,
    });

    expect(summary.succeeded).toEqual(["de"]);
    expect(events).toEqual([]);
  });
});

describe("importWorkbook: validating lockAcquireTimeoutMs", () => {
  it.each([[-5], [0.25], [Number.NaN]])(
    "refuses %s before the handoff is read",
    async (lockAcquireTimeoutMs) => {
      await expect(
        importWorkbook({
          config: config(),
          cwd: "/nonexistent",
          workbook: "handoff.xlsx",
          lockAcquireTimeoutMs,
        }),
      ).rejects.toMatchObject({ code: "LOCK_TIMEOUT_INVALID" });
    },
  );
});

describe("importWorkbook: the record step after the target is written ignores lockAcquireTimeoutMs", () => {
  it("records the lock and provenance when the lock-file guard is held past the timeout", async () => {
    const dir = await filledHandoff();
    const guardPath = await holdLockAt(lockFileGuardPath(dir), foreignHolder(9999));
    const release = releaseAfter(guardPath, 400);

    const summary = await importWorkbook({
      config: config(),
      cwd: dir,
      workbook: "handoff",
      format: "csv",
      lockAcquireTimeoutMs: 50,
    });
    await release;

    expect(localeSummary(summary.locales, "de").status).toBe("succeeded");
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
    expect(await readJsonFile(lockFilePath(dir))).toMatchObject({
      locales: { de: { greeting: expect.any(String) } },
    });
    expect(await readJsonFile(provenanceFilePath(dir))).toMatchObject({
      locales: { de: { greeting: expect.objectContaining({ origin: "import" }) } },
    });
  });
});

describe("importWorkbook: onLockWait never reports a lock this process holds", () => {
  it("reports no wait for a lock-file guard held by this process", async () => {
    const dir = await filledHandoff();
    const guardPath = await holdLockAt(lockFileGuardPath(dir), selfHolder());
    const release = releaseAfter(guardPath, 1_500);

    const events: LockWaitEvent[] = [];
    const summary = await importWorkbook({
      config: config(),
      cwd: dir,
      workbook: "handoff",
      format: "csv",
      onLockWait: (event) => events.push(event),
    });
    await release;

    expect(summary.failed).toEqual([]);
    expect(events).toEqual([]);
  });
});

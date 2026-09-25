import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cacheFilePath } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { loadProvenance } from "../lock/load-provenance.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { rejectEntry } from "./review-decision.js";
import { translate } from "./translate-project.js";

const guard = vi.hoisted(() => ({ contended: false }));

vi.mock(import("../lock/locale-write-lock.js"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    withLockFileGuard: (async (...args: Parameters<typeof original.withLockFileGuard>) => {
      if (guard.contended) {
        throw new SdkError("LOCK_CONTENDED", "the lock-file guard is held by another process");
      }
      return original.withLockFileGuard(...args);
    }) as typeof original.withLockFileGuard,
  };
});

const cfg = (): VerbatraConfig => baseConfig({ targetLocales: ["de"] });

interface Project {
  readonly dir: string;
  readonly value: string;
  readonly targetPath: string;
  readonly before: {
    readonly target: Buffer;
    readonly lock: string;
    readonly provenance: string;
    readonly memory: string;
  };
}

async function project(): Promise<Project> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello", farewell: "Bye" });
  await translate(
    { config: cfg(), cwd: dir },
    { createProvider: () => makeStubProvider().provider },
  );
  const targetPath = join(dir, "locales", "de.json");
  const values = JSON.parse(await readTextFile(targetPath)) as Record<string, string>;
  return {
    dir,
    value: values.greeting ?? "",
    targetPath,
    before: {
      target: await readFile(targetPath),
      lock: await readTextFile(join(dir, "verbatra.lock.json")),
      provenance: await readTextFile(join(dir, PROVENANCE_FILE_NAME)),
      memory: await readTextFile(cacheFilePath(dir)),
    },
  };
}

async function expectUntouched(p: Project, lock = p.before.lock): Promise<void> {
  expect(await readFile(p.targetPath)).toEqual(p.before.target);
  expect(await readTextFile(join(p.dir, "verbatra.lock.json"))).toBe(lock);
  expect(await readTextFile(join(p.dir, PROVENANCE_FILE_NAME))).toBe(p.before.provenance);
  expect((await loadProvenance({ cwd: p.dir })).locales.de?.greeting?.reviewState).toBeUndefined();
  expect(await readTextFile(cacheFilePath(p.dir))).toBe(p.before.memory);
}

function reject(p: Project, fs?: SdkFs) {
  return rejectEntry(
    { config: cfg(), cwd: p.dir, locale: "de", key: "greeting", expectedValue: p.value },
    fs === undefined ? {} : { fs },
  );
}

function failingWrites(match: (path: string) => boolean): SdkFs {
  return {
    ...defaultFs,
    writeFile: async (path, data) => {
      if (match(path)) {
        throw new Error("disk full");
      }
      await defaultFs.writeFile(path, data);
    },
  };
}

describe("rejectEntry: a failure leaves every file as it was", () => {
  it("a corrupt lock file stops the rejection before the locale file is touched", async () => {
    const p = await project();
    await writeFile(join(p.dir, "verbatra.lock.json"), "{ not json", "utf8");

    await expect(reject(p)).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });

    await expectUntouched(p, "{ not json");
  });

  it("a failing provenance write restores the locale file and records nothing", async () => {
    const p = await project();

    await expect(
      reject(
        p,
        failingWrites((path) => path.endsWith(PROVENANCE_FILE_NAME)),
      ),
    ).rejects.toThrow("disk full");

    await expectUntouched(p);
  });

  it("a failing lock write restores the locale file and the provenance file", async () => {
    const p = await project();

    await expect(
      reject(
        p,
        failingWrites((path) => path.endsWith("verbatra.lock.json")),
      ),
    ).rejects.toThrow("disk full");

    await expectUntouched(p);
  });

  it("a contended lock-file guard stops the rejection before anything is written", async () => {
    const p = await project();
    guard.contended = true;
    try {
      await expect(reject(p)).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    } finally {
      guard.contended = false;
    }

    await expectUntouched(p);
  });

  it("a locale file that cannot be copied in full is refused before anything is written", async () => {
    const p = await project();
    const fs: SdkFs = { ...defaultFs, readBytesBounded: async () => ({ kind: "too-large" }) };

    await expect(reject(p, fs)).rejects.toMatchObject({ code: "REVIEW_REJECT_UNSUPPORTED" });

    await expectUntouched(p);
  });

  it("a failing read-back restores the locale file", async () => {
    const p = await project();
    let targetChecks = 0;
    const fs: SdkFs = {
      ...defaultFs,
      fileExists: async (path) => {
        if (path === p.targetPath) {
          targetChecks += 1;
          if (targetChecks === 2) {
            throw new Error("read-back failed");
          }
        }
        return defaultFs.fileExists(path);
      },
    };

    await expect(reject(p, fs)).rejects.toThrow("read-back failed");

    await expectUntouched(p);
  });

  it("restores a provenance file that did not exist before by removing it again", async () => {
    const p = await project();
    const { rm } = await import("node:fs/promises");
    await rm(join(p.dir, PROVENANCE_FILE_NAME));

    await expect(
      reject(
        p,
        failingWrites((path) => path.endsWith("verbatra.lock.json")),
      ),
    ).rejects.toThrow("disk full");

    expect(await readFile(p.targetPath)).toEqual(p.before.target);
    await expect(readFile(join(p.dir, PROVENANCE_FILE_NAME))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("names the original failure and every file it could not put back when restoring fails too", async () => {
    const p = await project();
    let provenanceWrites = 0;
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async (path, data) => {
        if (path.endsWith("verbatra.lock.json")) {
          throw new Error("disk full");
        }
        if (path.endsWith(PROVENANCE_FILE_NAME)) {
          provenanceWrites += 1;
          if (provenanceWrites > 1) {
            throw new Error("restore refused");
          }
        }
        await defaultFs.writeFile(path, data);
      },
      writeBytes: async () => {
        throw new Error("restore refused");
      },
    };

    const error = await reject(p, fs).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "REVIEW_RESTORE_FAILED" });
    expect((error as Error).message).toContain("disk full");
    expect((error as Error).message).toContain("locales/de.json and verbatra.provenance.json");
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error).message).toBe("disk full");
    expect(await readTextFile(cacheFilePath(p.dir))).toBe(p.before.memory);
  });

  it("names only the file it could not put back", async () => {
    const p = await project();
    const fs: SdkFs = {
      ...failingWrites((path) => path.endsWith("verbatra.lock.json")),
      writeBytes: async () => {
        throw new Error("restore refused");
      },
    };

    const error = await reject(p, fs).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "REVIEW_RESTORE_FAILED" });
    expect((error as Error).message).toContain("so locales/de.json may not match");
    expect(await readTextFile(join(p.dir, PROVENANCE_FILE_NAME))).toBe(p.before.provenance);
  });

  it("reports the provenance file as not put back when no copy of it could be kept", async () => {
    const p = await project();
    let provenanceReads = 0;
    const fs: SdkFs = {
      ...failingWrites((path) => path.endsWith("verbatra.lock.json")),
      readFileBounded: async (path, max) => {
        if (path.endsWith(PROVENANCE_FILE_NAME)) {
          provenanceReads += 1;
          if (provenanceReads === 3) {
            return { kind: "too-large" };
          }
        }
        return defaultFs.readFileBounded(path, max);
      },
    };

    const error = await reject(p, fs).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "REVIEW_RESTORE_FAILED" });
    expect((error as Error).message).toContain("so verbatra.provenance.json may not match");
    expect(await readFile(p.targetPath)).toEqual(p.before.target);
  });

  it("throws the original error, not a restore failure, when the write fails before changing anything", async () => {
    const p = await project();
    const locales = join(p.dir, "locales");
    await chmod(locales, 0o500);
    try {
      const error = await reject(p).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: "TARGET_UNWRITABLE" });
      expect((error as Error).message).toContain("EACCES");
    } finally {
      await chmod(locales, 0o700);
    }

    await expectUntouched(p);
  });
});

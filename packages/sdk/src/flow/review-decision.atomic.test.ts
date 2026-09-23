import { mkdir, readFile, writeFile } from "node:fs/promises";
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
});

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { updateGlossaryTerm } from "../config/glossary-file.js";
import { glossaryGuardPath, localeLockPath } from "../lock/locale-write-lock.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { editEntry } from "./edit-entry.js";

async function holdLock(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ pid: 999_999, acquiredAt: "2026-07-18T00:00:00.000Z" }));
}

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo" });
  await writeJsonFile(join(dir, "glossary.json"), { Save: "Speichern" });
  return dir;
}

const config = baseConfig({ targetLocales: ["de"] });

describe("editEntry: lockAcquireTimeoutMs", () => {
  it("fails with LOCK_CONTENDED once the bound elapses on a held locale lock, writing nothing", async () => {
    const dir = await project();
    await holdLock(localeLockPath(dir, "de"));

    await expect(
      editEntry({
        config,
        cwd: dir,
        locale: "de",
        key: "greeting",
        value: "Servus",
        lockAcquireTimeoutMs: 0,
      }),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });

  it.each([[-1], [1.5], [Number.NaN]])(
    "refuses %s with LOCK_TIMEOUT_INVALID before anything is read",
    async (lockAcquireTimeoutMs) => {
      await expect(
        editEntry({
          config,
          cwd: "/nonexistent",
          locale: "de",
          key: "greeting",
          value: "Servus",
          lockAcquireTimeoutMs,
        }),
      ).rejects.toMatchObject({ code: "LOCK_TIMEOUT_INVALID" });
    },
  );
});

describe("updateGlossaryTerm: lockAcquireTimeoutMs", () => {
  it("fails with LOCK_CONTENDED once the bound elapses on a held glossary lock", async () => {
    const dir = await project();
    await holdLock(glossaryGuardPath(dir));

    await expect(
      updateGlossaryTerm({
        glossary: { source: "file", path: join(dir, "glossary.json") },
        cwd: dir,
        term: "Open",
        translation: "Öffnen",
        lockAcquireTimeoutMs: 0,
      }),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(await readJsonFile(join(dir, "glossary.json"))).toEqual({ Save: "Speichern" });
  });

  it("refuses an invalid bound with LOCK_TIMEOUT_INVALID", async () => {
    const dir = await project();

    await expect(
      updateGlossaryTerm({
        glossary: { source: "file", path: join(dir, "glossary.json") },
        cwd: dir,
        term: "Open",
        translation: "Öffnen",
        lockAcquireTimeoutMs: -5,
      }),
    ).rejects.toMatchObject({ code: "LOCK_TIMEOUT_INVALID" });
  });
});

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { editEntry } from "./edit-entry.js";

const config = baseConfig({ targetLocales: ["de"], format: "i18next-json" });
const BASELINE = '{"version":1,"locales":{"de":{"greeting":"oldhash"}}}\n';
const MERGE_CONFLICT = "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> main\n";

async function project(lock: string = BASELINE): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo alt" });
  await writeFile(join(dir, "verbatra.lock.json"), lock);
  return dir;
}

function edit(dir: string, deps: { fs?: SdkFs } = {}) {
  return editEntry({ config, cwd: dir, locale: "de", key: "greeting", value: "Hallo neu" }, deps);
}

function lockFileOf(dir: string): string {
  return readFileSync(join(dir, "verbatra.lock.json"), "utf8");
}

describe("editEntry: an unreadable lock-file", () => {
  it.each([
    ["corrupt JSON", MERGE_CONFLICT],
    ["a bad shape", '{"version":1,"locales":[]}'],
    ["an unsupported version", '{"version":2,"locales":{}}'],
  ])("refuses %s before writing anything", async (_name, lock) => {
    const dir = await project(lock);

    await expect(edit(dir)).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo alt" });
    expect(lockFileOf(dir)).toBe(lock);
    expect(existsSync(join(dir, "verbatra.provenance.json"))).toBe(false);
  });

  it("rechecks the lock-file under the write lock before the locale file is written", async () => {
    const dir = await project();
    let lockReads = 0;
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async (path, max) => {
        if (path.endsWith("verbatra.lock.json")) {
          lockReads += 1;
          if (lockReads >= 2) return { kind: "ok", content: MERGE_CONFLICT };
        }
        return defaultFs.readFileBounded(path, max);
      },
    };

    await expect(edit(dir, { fs })).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo alt" });
    expect(existsSync(join(dir, "verbatra.provenance.json"))).toBe(false);
  });

  it("still saves the value and records its baseline when the lock-file stays readable", async () => {
    const dir = await project();

    await expect(edit(dir)).resolves.toMatchObject({ accepted: true });
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo neu" });
    expect(lockFileOf(dir)).not.toContain("oldhash");
  });
});

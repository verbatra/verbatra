import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { retranslateEntry } from "./retranslate-entry.js";

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

function retranslate(dir: string, provider: ReturnType<typeof makeStubProvider>["provider"]) {
  return retranslateEntry(
    { config, cwd: dir, locale: "de", key: "greeting" },
    { createProvider: () => provider },
  );
}

function lockFileOf(dir: string): string {
  return readFileSync(join(dir, "verbatra.lock.json"), "utf8");
}

describe("retranslateEntry: an unreadable lock-file", () => {
  it.each([
    ["corrupt JSON", MERGE_CONFLICT],
    ["a bad shape", '{"version":1,"locales":[]}'],
    ["an unsupported version", '{"version":2,"locales":{}}'],
  ])("refuses %s before calling the provider or writing anything", async (_name, lock) => {
    const dir = await project(lock);
    const stub = makeStubProvider();

    await expect(retranslate(dir, stub.provider)).rejects.toMatchObject({
      code: "LOCK_FILE_INVALID",
    });
    expect(stub.calls).toHaveLength(0);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo alt" });
    expect(lockFileOf(dir)).toBe(lock);
  });

  it("refuses before writing when the lock-file is corrupted while the provider runs", async () => {
    const dir = await project();
    const stub = makeStubProvider();
    const provider = {
      ...stub.provider,
      translateBatch: async (request: Parameters<typeof stub.provider.translateBatch>[0]) => {
        const answer = await stub.provider.translateBatch(request);
        await writeFile(join(dir, "verbatra.lock.json"), MERGE_CONFLICT);
        return answer;
      },
    };

    await expect(retranslate(dir, provider)).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });
    expect(stub.calls).toHaveLength(1);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo alt" });
    expect(existsSync(join(dir, "verbatra.provenance.json"))).toBe(false);
    expect(existsSync(join(dir, "verbatra.cache.json"))).toBe(false);
  });

  it("still saves the value and records its baseline when the lock-file stays readable", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    await expect(retranslate(dir, stub.provider)).resolves.toMatchObject({ accepted: true });
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "[de] Hello" });
    expect(lockFileOf(dir)).not.toContain("oldhash");
  });
});

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { type LockWaitEvent, lockFileGuardPath } from "../lock/locale-write-lock.js";
import { renameRecordKeys } from "../record-utils.js";
import { makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import {
  carryOverRespelledLocales,
  movedFrom,
  planLocaleMoves,
  respellingsOf,
  withCarryOverNotices,
} from "./locale-carry-over.js";

describe("respellingsOf: underscore spellings of a configured code", () => {
  it.each([
    ["pt-BR", ["pt_BR"], ["pt_BR"]],
    ["pt-BR", ["pt_br", "PT_BR"], ["pt_br", "PT_BR"]],
    ["zh-Hant-TW", ["zh_Hant_TW", "zh_Hant"], ["zh_Hant_TW"]],
    ["pt-BR", ["pt-BR", "pt-br", "ptBR"], []],
    ["de", ["de", "DE", "de_"], []],
  ])("finds the candidates for %s among %j", (locale, candidates, expected) => {
    expect(respellingsOf(locale, candidates)).toEqual(expected);
  });
});

describe("planLocaleMoves: one candidate, no own state", () => {
  it("moves the only candidate onto a configured code without state", () => {
    expect(planLocaleMoves(["de", "pt-BR"], new Set(["de", "pt_BR"]))).toEqual(
      new Map([["pt_BR", "pt-BR"]]),
    );
  });

  it("moves nothing onto a code that already has state", () => {
    expect(planLocaleMoves(["pt-BR"], new Set(["pt-BR", "pt_BR"]))).toEqual(new Map());
  });

  it("moves nothing when two candidates compete", () => {
    expect(planLocaleMoves(["pt-BR"], new Set(["pt_BR", "pt_br"]))).toEqual(new Map());
  });
});

describe("renameRecordKeys: moving a key onto a new name", () => {
  it("moves the value and drops an empty block already under the new name", () => {
    expect(
      renameRecordKeys({ pt_BR: 1, "pt-BR": 0, de: 2 }, new Map([["pt_BR", "pt-BR"]])),
    ).toEqual({ "pt-BR": 1, de: 2 });
  });

  it("leaves the record alone when the old name is absent, so it is idempotent", () => {
    expect(renameRecordKeys({ "pt-BR": 1 }, new Map([["pt_BR", "pt-BR"]]))).toEqual({ "pt-BR": 1 });
  });
});

describe("carryOverRespelledLocales: files it may not write", () => {
  it("leaves a provenance file and a memory written by a newer verbatra untouched", async () => {
    const dir = await makeTempDir();
    const provenance = {
      version: 99,
      locales: { pt_BR: { a: { origin: "machine", valueHash: "v" } } },
    };
    const cache = { version: 99, entries: { fp: { pt_BR: { h: "x" } } }, sources: {} };
    await writeJsonFile(join(dir, "verbatra.provenance.json"), provenance);
    await writeJsonFile(join(dir, "verbatra.cache.json"), cache);

    const plan = await carryOverRespelledLocales(dir, defaultFs, ["pt-BR"], {
      dryRun: false,
      memory: true,
    });

    expect(plan.carried).toEqual([]);
    expect(await readJsonFile(join(dir, "verbatra.provenance.json"))).toEqual(provenance);
    expect(await readJsonFile(join(dir, "verbatra.cache.json"))).toEqual(cache);
  });

  it("keeps the lock-file move when the memory cannot be written", async () => {
    const dir = await makeTempDir();
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { pt_BR: { a: "h" } },
    });
    await writeJsonFile(join(dir, "verbatra.cache.json"), {
      version: 2,
      entries: { fp: { pt_BR: { h: "x" } } },
      sources: {},
    });
    const cachePath = join(dir, "verbatra.cache.json");
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async (path, content) => {
        if (path === cachePath) {
          throw new Error("EACCES");
        }
        await defaultFs.writeFile(path, content);
      },
    };

    const plan = await carryOverRespelledLocales(dir, fs, ["pt-BR"], {
      dryRun: false,
      memory: true,
    });

    expect(plan.carried).toEqual([{ from: "pt_BR", to: "pt-BR", files: ["verbatra.lock.json"] }]);
    expect(plan.skipped).toEqual([
      { from: "pt_BR", to: "pt-BR", files: ["verbatra.cache.json"], reason: "EACCES" },
    ]);
    expect(plan.memory).toEqual(new Map());
  });
});

async function respelledStateFiles(): Promise<string> {
  const dir = await makeTempDir();
  await writeJsonFile(join(dir, "verbatra.lock.json"), {
    version: 1,
    locales: { pt_BR: { a: "h" } },
  });
  await writeJsonFile(join(dir, "verbatra.provenance.json"), {
    version: 1,
    locales: { pt_BR: { a: { origin: "human", valueHash: "v" } } },
  });
  return dir;
}

function failingWrites(failing: string): SdkFs {
  return {
    ...defaultFs,
    writeFile: async (path, content) => {
      if (path === failing) {
        throw new Error("EROFS: read-only file system");
      }
      await defaultFs.writeFile(path, content);
    },
  };
}

const live = { dryRun: false, memory: false } as const;

describe("carryOverRespelledLocales: the lock-file guard", () => {
  it("takes no guard when nothing is to be moved", async () => {
    const dir = await makeTempDir();
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { "pt-BR": { a: "h" } },
    });
    const guarded: string[] = [];
    const fs: SdkFs = {
      ...defaultFs,
      createExclusive: async (path, data) => {
        guarded.push(path);
        return defaultFs.createExclusive(path, data);
      },
    };

    const plan = await carryOverRespelledLocales(dir, fs, ["pt-BR"], live);

    expect(guarded).toEqual([]);
    expect(plan).toMatchObject({ carried: [], skipped: [] });
  });

  it("skips the move with its reason when the guard stays contended", async () => {
    const dir = await respelledStateFiles();
    const guard = lockFileGuardPath(dir);
    await mkdir(dirname(guard), { recursive: true });
    await writeFile(guard, JSON.stringify({ pid: 9999, hostname: "elsewhere" }), "utf8");
    const waits: LockWaitEvent[] = [];

    const plan = await carryOverRespelledLocales(dir, defaultFs, ["pt-BR"], {
      ...live,
      lock: { acquireTimeoutMs: 20, onWait: (event) => waits.push(event) },
    });

    expect(plan.carried).toEqual([]);
    expect(plan.skipped).toMatchObject([
      { from: "pt_BR", to: "pt-BR", files: ["verbatra.lock.json", "verbatra.provenance.json"] },
    ]);
    expect(plan.skipped[0]?.reason).toContain("Could not acquire the write lock");
    expect(waits[0]).toMatchObject({ lockPath: guard });
    expect(await readJsonFile(join(dir, "verbatra.lock.json"))).toMatchObject({
      locales: { pt_BR: { a: "h" } },
    });
  });

  it("keeps the provenance move when the lock file cannot be written", async () => {
    const dir = await respelledStateFiles();

    const plan = await carryOverRespelledLocales(
      dir,
      failingWrites(join(dir, "verbatra.lock.json")),
      ["pt-BR"],
      live,
    );

    expect(plan.carried).toEqual([
      { from: "pt_BR", to: "pt-BR", files: ["verbatra.provenance.json"] },
    ]);
    expect(plan.skipped).toEqual([
      {
        from: "pt_BR",
        to: "pt-BR",
        files: ["verbatra.lock.json"],
        reason: "EROFS: read-only file system",
      },
    ]);
  });

  it("keeps the lock-file move when the provenance file cannot be written", async () => {
    const dir = await respelledStateFiles();

    const plan = await carryOverRespelledLocales(
      dir,
      failingWrites(join(dir, "verbatra.provenance.json")),
      ["pt-BR"],
      live,
    );

    expect(plan.carried).toEqual([{ from: "pt_BR", to: "pt-BR", files: ["verbatra.lock.json"] }]);
    expect(plan.skipped).toMatchObject([{ files: ["verbatra.provenance.json"] }]);
    expect(await readJsonFile(join(dir, "verbatra.lock.json"))).toMatchObject({
      locales: { "pt-BR": { a: "h" } },
    });
  });

  it("reports the moves it wrote when releasing the guard fails", async () => {
    const dir = await respelledStateFiles();
    const guard = lockFileGuardPath(dir);
    const fs: SdkFs = {
      ...defaultFs,
      deleteFile: async (path) => {
        await defaultFs.deleteFile(path);
        if (path === guard) {
          throw new Error("EIO");
        }
      },
    };

    const plan = await carryOverRespelledLocales(dir, fs, ["pt-BR"], live);

    expect(plan.carried).toEqual([
      { from: "pt_BR", to: "pt-BR", files: ["verbatra.lock.json", "verbatra.provenance.json"] },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("still fails the run on a lock file that turned corrupt under the guard", async () => {
    const dir = await respelledStateFiles();
    const lockPath = join(dir, "verbatra.lock.json");
    let reads = 0;
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async (path, maxBytes) => {
        if (path === lockPath && ++reads > 1) {
          return { kind: "ok", content: "{" };
        }
        return defaultFs.readFileBounded(path, maxBytes);
      },
    };

    await expect(carryOverRespelledLocales(dir, fs, ["pt-BR"], live)).rejects.toMatchObject({
      code: "LOCK_FILE_INVALID",
    });
  });

  it("plans the provenance move on a dry run without writing it", async () => {
    const dir = await respelledStateFiles();

    const plan = await carryOverRespelledLocales(dir, defaultFs, ["pt-BR"], {
      dryRun: true,
      memory: false,
    });

    expect(plan.provenance).toEqual(new Map([["pt_BR", "pt-BR"]]));
    expect(movedFrom(plan.provenance, "pt-BR")).toBe("pt_BR");
    expect(movedFrom(plan.provenance, "de")).toBe("de");
    expect(await readJsonFile(join(dir, "verbatra.provenance.json"))).toMatchObject({
      locales: { pt_BR: {} },
    });
  });
});

describe("withCarryOverNotices: the locale it belongs to", () => {
  it("adds nothing to a locale nothing was moved onto", () => {
    const summary = { locale: "de", notices: [] } as unknown as Parameters<
      typeof withCarryOverNotices
    >[0][number];

    expect(
      withCarryOverNotices(
        [summary],
        {
          carried: [{ from: "pt_BR", to: "pt-BR", files: [] }],
          skipped: [{ from: "pt_BR", to: "pt-BR", files: [], reason: "x" }],
        },
        false,
      ),
    ).toEqual([summary]);
  });

  it("ends a skip reason with a full stop exactly once", () => {
    const summary = { locale: "pt-BR", notices: [] } as unknown as Parameters<
      typeof withCarryOverNotices
    >[0][number];
    const skip = { from: "pt_BR", to: "pt-BR", files: ["verbatra.lock.json"] as const };

    const [withStop, without] = [
      withCarryOverNotices([summary], { carried: [], skipped: [{ ...skip, reason: "a." }] }, false),
      withCarryOverNotices([summary], { carried: [], skipped: [{ ...skip, reason: "a" }] }, false),
    ].map((summaries) => summaries[0]?.notices[0]);

    expect(withStop).toEqual(without);
    expect(withStop).toEqual({
      code: "LOCALE_STATE_CARRY_OVER_SKIPPED",
      message:
        'The state recorded under "pt_BR" in verbatra.lock.json was not moved to "pt-BR": a. ' +
        "This run went on without it, and the locale-state check of doctor lists what stays " +
        "behind.",
    });
  });
});

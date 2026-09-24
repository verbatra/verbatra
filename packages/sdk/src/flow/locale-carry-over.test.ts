import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { type LockWaitEvent, lockFileGuardPath } from "../lock/locale-write-lock.js";
import { renameRecordKeys } from "../record-utils.js";
import { makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import {
  carryOverRefusal,
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
      lock: { acquireTimeoutMs: 1_200, onWait: (event) => waits.push(event) },
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

  it("plans no provenance move on a dry run when the provenance file is corrupt", async () => {
    const dir = await respelledStateFiles();
    await writeFile(join(dir, "verbatra.provenance.json"), "{");

    const plan = await carryOverRespelledLocales(dir, defaultFs, ["pt-BR"], {
      dryRun: true,
      memory: false,
    });

    expect(plan.provenance).toEqual(new Map());
    expect(plan.carried).toEqual([{ from: "pt_BR", to: "pt-BR", files: ["verbatra.lock.json"] }]);
  });

  it("fails a dry run on a provenance read error that is not a corrupt file", async () => {
    const dir = await respelledStateFiles();
    const provenancePath = join(dir, "verbatra.provenance.json");
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async (path, maxBytes) => {
        if (path === provenancePath) {
          throw new Error("EACCES: permission denied");
        }
        return defaultFs.readFileBounded(path, maxBytes);
      },
    };

    await expect(
      carryOverRespelledLocales(dir, fs, ["pt-BR"], { dryRun: true, memory: false }),
    ).rejects.toThrow("EACCES: permission denied");
    expect(await readJsonFile(join(dir, "verbatra.lock.json"))).toMatchObject({
      locales: { pt_BR: { a: "h" } },
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
        "The locale did not run, and the next run tries the move again.",
    });
  });
});

describe("withCarryOverNotices: what a skip costs the locale", () => {
  const summary = { locale: "pt-BR", notices: [] } as unknown as Parameters<
    typeof withCarryOverNotices
  >[0][number];

  it.each([
    [["verbatra.cache.json"], false, "The translation memory is only a cache"],
    [["verbatra.provenance.json"], false, "The locale did not run"],
    [["verbatra.lock.json"], true, "A live run would not run the locale while that holds."],
  ] as const)("describes a skip of %j (dry run %s)", (files, dryRun, expected) => {
    const [notice] =
      withCarryOverNotices(
        [summary],
        { carried: [], skipped: [{ from: "pt_BR", to: "pt-BR", files, reason: "r" }] },
        dryRun,
      )[0]?.notices ?? [];

    expect(notice?.message).toContain(expected);
  });
});

describe("carryOverRefusal: withholding a locale whose state stayed behind", () => {
  const skip = (files: readonly ("verbatra.lock.json" | "verbatra.cache.json")[]) => ({
    skipped: [{ from: "pt_BR", to: "pt-BR", files, reason: "EROFS." }],
  });

  it("refuses the locale when the lock file or the provenance file stayed behind", () => {
    const refusal = carryOverRefusal(skip(["verbatra.lock.json"]), "pt-BR", false);

    expect(refusal).toMatchObject({ code: "LOCALE_STATE_NOT_CARRIED_OVER" });
    expect(refusal?.message).toBe(
      'The state recorded under "pt_BR" in verbatra.lock.json could not be moved to "pt-BR": ' +
        "EROFS. It did not run, and the next run tries the move again, because recording its " +
        'results under "pt-BR" would leave the protection and rejection records under "pt_BR" ' +
        "unapplied.",
    );
  });

  it("says what a live run would do on a dry run", () => {
    expect(carryOverRefusal(skip(["verbatra.lock.json"]), "pt-BR", true)?.message).toContain(
      "EROFS. A live run would not run it while that holds",
    );
  });

  it("lets the locale run when only the translation memory stayed behind", () => {
    expect(carryOverRefusal(skip(["verbatra.cache.json"]), "pt-BR", false)).toBeUndefined();
  });

  it("lets every other locale run", () => {
    expect(carryOverRefusal(skip(["verbatra.lock.json"]), "de", false)).toBeUndefined();
  });
});

describe("carryOverRespelledLocales: a locale whose lock-file state stays behind", () => {
  async function withMemory(dir: string): Promise<void> {
    await writeJsonFile(join(dir, "verbatra.cache.json"), {
      version: 2,
      entries: { fp: { pt_BR: { h: "x" } } },
      sources: {},
    });
  }

  it("leaves its translation memory where it is too, so nothing lands under the new code", async () => {
    const dir = await respelledStateFiles();
    await withMemory(dir);

    const plan = await carryOverRespelledLocales(
      dir,
      failingWrites(join(dir, "verbatra.lock.json")),
      ["pt-BR"],
      { dryRun: false, memory: true },
    );

    expect(plan.memory).toEqual(new Map());
    expect(await readJsonFile(join(dir, "verbatra.cache.json"))).toMatchObject({
      entries: { fp: { pt_BR: { h: "x" } } },
    });
  });

  it("plans the skip on a dry run while another process holds the lock-file guard", async () => {
    const dir = await respelledStateFiles();
    await withMemory(dir);
    const guard = lockFileGuardPath(dir);
    await mkdir(dirname(guard), { recursive: true });
    await writeFile(guard, JSON.stringify({ pid: 9999, hostname: "elsewhere" }), "utf8");

    const plan = await carryOverRespelledLocales(dir, defaultFs, ["pt-BR"], {
      dryRun: true,
      memory: true,
    });

    expect(plan).toMatchObject({ carried: [], lock: new Map(), memory: new Map() });
    expect(plan.skipped).toEqual([
      {
        from: "pt_BR",
        to: "pt-BR",
        files: ["verbatra.lock.json", "verbatra.provenance.json"],
        reason: `another process holds the lock-file guard at ${guard}`,
      },
    ]);
    expect(await readFile(guard, "utf8")).toContain("9999");
  });

  it("plans the move on a dry run when the guard was left by a process that exited", async () => {
    const dir = await respelledStateFiles();
    const guard = lockFileGuardPath(dir);
    await mkdir(dirname(guard), { recursive: true });
    await writeFile(guard, JSON.stringify({ pid: 1, hostname: "gone-host" }), "utf8");

    const plan = await carryOverRespelledLocales(dir, defaultFs, ["pt-BR"], {
      dryRun: true,
      memory: false,
      lock: {
        liveness: {
          host: "gone-host",
          probe: () => {
            throw Object.assign(new Error("gone"), { code: "ESRCH" });
          },
        },
      },
    });

    expect(plan.skipped).toEqual([]);
    expect(plan.lock).toEqual(new Map([["pt_BR", "pt-BR"]]));
  });
});

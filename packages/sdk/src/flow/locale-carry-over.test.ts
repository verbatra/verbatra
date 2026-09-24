import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { renameRecordKeys } from "../record-utils.js";
import { makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import {
  carryOverRespelledLocales,
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
  });
});

describe("withCarryOverNotices: the locale it belongs to", () => {
  it("adds nothing to a locale nothing was moved onto", () => {
    const summary = { locale: "de", notices: [] } as unknown as Parameters<
      typeof withCarryOverNotices
    >[0][number];

    expect(
      withCarryOverNotices([summary], [{ from: "pt_BR", to: "pt-BR", files: [] }], false),
    ).toEqual([summary]);
  });
});

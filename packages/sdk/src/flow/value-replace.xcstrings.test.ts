import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import {
  applyValueReplace,
  previewValueReplace,
  type ValueReplaceEntryRef,
} from "./value-replace.js";

const LOCALES = Array.from({ length: 40 }, (_, index) => `x${String(index).padStart(2, "0")}`);

function unit(value: string): { stringUnit: { state: string; value: string } } {
  return { stringUnit: { state: "translated", value } };
}

async function catalogue(locales: readonly string[]): Promise<string> {
  const dir = await makeTempDir();
  const strings: Record<string, unknown> = {};
  for (const key of ["greeting", "farewell"]) {
    const localizations: Record<string, unknown> = { en: unit(`Source ${key}`) };
    for (const locale of locales) {
      localizations[locale] = unit(`${locale} ${key} X`);
    }
    strings[key] = { localizations };
  }
  await writeFile(
    join(dir, "Localizable.xcstrings"),
    JSON.stringify({ sourceLanguage: "en", version: "1.0", strings }),
    "utf8",
  );
  return dir;
}

function configFor(locales: readonly string[]): VerbatraConfig {
  return baseConfig({
    targetLocales: [...locales],
    format: "apple-xcstrings",
    files: { pattern: "{locale}Localizable.xcstrings" },
  });
}

interface Observation {
  readonly fs: SdkFs;
  readonly contended: string[];
}

function observingFs(): Observation {
  const contended: string[] = [];
  return {
    contended,
    fs: {
      ...defaultFs,
      createExclusive: async (path, data) => {
        const created = await defaultFs.createExclusive(path, data);
        if (!created) {
          contended.push(path.slice(path.lastIndexOf("/") + 1));
        }
        return created;
      },
    },
  };
}

describe("applyValueReplace: apple-xcstrings, one catalogue for 40 locales", () => {
  it("applies every locale one after another without ever contending on the shared lock", async () => {
    const dir = await catalogue(LOCALES);
    const config = configFor(LOCALES);
    const listed = await previewValueReplace({ config, cwd: dir, find: "X", replace: "Y" });
    expect(listed.entries).toHaveLength(80);
    const entries: ValueReplaceEntryRef[] = listed.entries.map(({ locale, key, valueHash }) => ({
      locale,
      key,
      valueHash,
    }));
    const { fs, contended } = observingFs();

    const result = await applyValueReplace(
      { config, cwd: dir, find: "X", replace: "Y", entries, actor: "human" },
      { fs },
    );

    expect(result.counts).toEqual({ applied: 80, skipped: 0, refused: 0, changed: 0 });
    expect(contended.filter((name) => name === "_catalogue.lock")).toEqual([]);
    const written = JSON.parse(await readFile(join(dir, "Localizable.xcstrings"), "utf8")) as {
      strings: Record<string, { localizations: Record<string, { stringUnit: { value: string } }> }>;
    };
    for (const locale of LOCALES) {
      for (const key of ["greeting", "farewell"]) {
        expect(written.strings[key]?.localizations[locale]?.stringUnit.value).toBe(
          `${locale} ${key} Y`,
        );
      }
    }
    expect(written.strings.greeting?.localizations.en?.stringUnit.value).toBe("Source greeting");
  });

  it("keeps the order of outcomes when entries of different locales interleave", async () => {
    const dir = await catalogue(["x00", "x01"]);
    const config = configFor(["x00", "x01"]);
    const listed = await previewValueReplace({ config, cwd: dir, find: "X", replace: "Y" });
    const byLocale = new Map(
      listed.entries.map((entry) => [`${entry.locale}/${entry.key}`, entry]),
    );
    const order = ["x01/greeting", "x00/farewell", "x01/farewell", "x00/greeting"];
    const entries = order.map((id) => {
      const entry = byLocale.get(id);
      return {
        locale: entry?.locale ?? "",
        key: entry?.key ?? "",
        valueHash: entry?.valueHash ?? "",
      };
    });

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries,
      actor: "human",
    });

    expect(result.outcomes.map((outcome) => `${outcome.locale}/${outcome.key}`)).toEqual(order);
    expect(result.outcomes.every((outcome) => outcome.status === "applied")).toBe(true);
  });
});

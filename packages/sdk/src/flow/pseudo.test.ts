import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRegistry } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { CACHE_FILE_NAME } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs } from "../fs.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  readJsonFile,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { pseudolocalize } from "./pseudo.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

async function project(source: Record<string, unknown>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo" });
  return dir;
}

const outputPath = (dir: string, locale = "en-XA"): string =>
  join(dir, ".verbatra-local", "pseudo", "locales", `${locale}.json`);

describe("pseudolocalize: where the output goes", () => {
  it("writes the pseudolocale under the ignored local directory by default", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(result.path).toBe(outputPath(dir));
    expect(await readJsonFile(result.path)).toEqual({ greeting: "[Ĥéĺĺó··]" });
  });

  it("defaults to the en-XA pseudolocale", async () => {
    const dir = await project({ greeting: "Hello" });

    expect((await pseudolocalize({ config: cfg(), cwd: dir })).locale).toBe("en-XA");
  });

  it("accepts another pseudolocale code", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir, locale: "en-XB" });

    expect(result.path).toBe(outputPath(dir, "en-XB"));
  });

  it("accepts an explicit output directory", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir, out: "build/pseudo" });

    expect(result.path).toBe(join(dir, "build", "pseudo", "locales", "en-XA.json"));
  });

  it("leaves the source and target locale files untouched", async () => {
    const dir = await project({ greeting: "Hello" });
    const before = await readFile(join(dir, "locales", "en.json"), "utf8");

    await pseudolocalize({ config: cfg(), cwd: dir });

    expect(await readFile(join(dir, "locales", "en.json"), "utf8")).toBe(before);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });

  it("writes neither the lock file nor the translation-memory cache", async () => {
    const dir = await project({ greeting: "Hello" });

    await pseudolocalize({ config: cfg(), cwd: dir });

    expect(await defaultFs.fileExists(join(dir, LOCK_FILE_NAME))).toBe(false);
    expect(await defaultFs.fileExists(join(dir, CACHE_FILE_NAME))).toBe(false);
  });
});

describe("pseudolocalize: the destructive case is refused", () => {
  it("refuses a pseudolocale that is the source locale", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(pseudolocalize({ config: cfg(), cwd: dir, locale: "en" })).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
    });
  });

  it("refuses a pseudolocale that is a configured target locale", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(pseudolocalize({ config: cfg(), cwd: dir, locale: "DE" })).rejects.toBeInstanceOf(
      SdkError,
    );
  });

  it("refuses an output path that is a configured locale file", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      `${JSON.stringify({ sourceLanguage: "en", version: "1.0", strings: {} }, null, 2)}\n`,
      "utf8",
    );
    const config = cfg({
      format: "apple-xcstrings",
      files: { pattern: "Localizable{locale}.xcstrings" },
    });

    await expect(pseudolocalize({ config, cwd: dir, out: "." })).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
    });
  });
});

describe("pseudolocalize: every written value clears the project's integrity gate", () => {
  it("accepts every pseudo value against its source entry", async () => {
    const dir = await project({
      greeting: "Hello {{name}}",
      count: "You have {{count}} unread messages waiting",
      nested: "See $t(common.terms) before you continue",
      plain: "Delete this account permanently",
    });
    const adapter = createDefaultRegistry().resolve("", { format: "i18next-json" });
    if (adapter.status !== "resolved") {
      throw new Error("the i18next adapter did not resolve");
    }

    const result = await pseudolocalize({ config: cfg(), cwd: dir });
    const source = await adapter.adapter.read(join(dir, "locales", "en.json"), "en");
    const written = await adapter.adapter.read(result.path, "en-XA");

    for (const [key, entry] of source.resource.entries) {
      const candidate = written.resource.entries.get(key);
      expect(candidate).toBeDefined();
      expect(gateCandidateValue(entry, candidate?.value ?? "", adapter.adapter)).toEqual({
        accepted: true,
      });
    }
  });

  it("reports every source key as transformed when all of them clear the gate", async () => {
    const dir = await project({ a: "Hello there", b: "Goodbye now" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(result).toMatchObject({ entries: 2, transformed: 2, copied: [], written: true });
  });

  it("copies a value the gate would refuse rather than writing a broken one", async () => {
    const dir = await project({ a: "Hello there", runaway: "a".repeat(40) });

    const result = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(result.copied).toEqual(["runaway"]);
    expect(result.transformed).toBe(1);
    expect(await readJsonFile(result.path)).toMatchObject({ runaway: "a".repeat(40) });
  });

  it("copies a value whose source is already invalid for the format", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { broken: "Hi {0 unclosed" });
    const config = cfg({ format: "next-intl-json", targetLocales: ["de"] });

    const result = await pseudolocalize({ config, cwd: dir });

    expect(result.copied).toEqual(["broken"]);
  });
});

describe("pseudolocalize: running it twice changes nothing", () => {
  it("reports the second run as unwritten and leaves the file byte-identical", async () => {
    const dir = await project({ greeting: "Hello", other: "Goodbye" });

    const first = await pseudolocalize({ config: cfg(), cwd: dir });
    const afterFirst = await readFile(first.path, "utf8");
    const second = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
    expect(await readFile(second.path, "utf8")).toBe(afterFirst);
  });

  it("rewrites the file when the previous output can no longer be parsed", async () => {
    const dir = await project({ greeting: "Hello" });
    const first = await pseudolocalize({ config: cfg(), cwd: dir });
    await writeFile(first.path, "{ not json", "utf8");

    expect((await pseudolocalize({ config: cfg(), cwd: dir })).written).toBe(true);
  });

  it("rewrites the file once the source changes", async () => {
    const dir = await project({ greeting: "Hello" });
    await pseudolocalize({ config: cfg(), cwd: dir });
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello again" });

    expect((await pseudolocalize({ config: cfg(), cwd: dir })).written).toBe(true);
  });
});

describe("pseudolocalize: shared-catalogue formats", () => {
  it("reports a catalogue it cannot copy rather than writing a partial one", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      `${JSON.stringify({ sourceLanguage: "en", version: "1.0", strings: {} }, null, 2)}\n`,
      "utf8",
    );
    const config = cfg({
      format: "apple-xcstrings",
      files: { pattern: "Localizable{locale}.xcstrings" },
    });
    let reads = 0;
    const fs = makeFakeFs({
      ...realDiskReads(),
      readFileBounded: async (path: string, maxBytes: number) => {
        reads += 1;
        return reads > 1
          ? { kind: "too-large" as const }
          : defaultFs.readFileBounded(path, maxBytes);
      },
    });

    await expect(pseudolocalize({ config, cwd: dir }, { fs })).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
  });

  it("seeds the output catalogue from the source before patching the pseudolocale in", async () => {
    const dir = await makeTempDir();
    const catalogue = {
      sourceLanguage: "en",
      version: "1.0",
      strings: {
        greeting: {
          localizations: { en: { stringUnit: { state: "translated", value: "Hello" } } },
        },
      },
    };
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      `${JSON.stringify(catalogue, null, 2)}\n`,
      "utf8",
    );
    const config = cfg({
      format: "apple-xcstrings",
      files: { pattern: "Localizable{locale}.xcstrings" },
    });

    const result = await pseudolocalize({ config, cwd: dir });
    const written = (await readJsonFile(result.path)) as {
      strings: Record<string, { localizations: Record<string, { stringUnit: { value: string } }> }>;
    };

    expect(written.strings.greeting?.localizations["en-XA"]?.stringUnit.value).toBe("[Ĥéĺĺó··]");
  });
});

const xliffDocument = (targetLanguage: string, units: string): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<xliff version="1.2"><file source-language="en" target-language="${targetLanguage}" datatype="plaintext" original="app"><body>${units}</body></file></xliff>\n`;

const xliffUnit = (id: string, text: string): string =>
  `<trans-unit id="${id}"><source>${text}</source><target>${text}</target></trans-unit>`;

const xliffConfig = (): VerbatraConfig =>
  cfg({ format: "xliff", files: { pattern: "locales/{locale}.xlf" } });

async function xliffProject(units: string, targetLanguage = "de"): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales", "en.xlf"), xliffDocument(targetLanguage, units), "utf8");
  return dir;
}

const xcstringsConfig = (): VerbatraConfig =>
  cfg({ format: "apple-xcstrings", files: { pattern: "Localizable{locale}.xcstrings" } });

const xcstringsCatalogue = (values: Readonly<Record<string, string>>): string =>
  `${JSON.stringify(
    {
      sourceLanguage: "en",
      version: "1.0",
      strings: Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          { localizations: { en: { stringUnit: { state: "translated", value } } } },
        ]),
      ),
    },
    null,
    2,
  )}\n`;

async function xcstringsProject(values: Readonly<Record<string, string>>): Promise<string> {
  const dir = await makeTempDir();
  await writeFile(join(dir, "Localizable.xcstrings"), xcstringsCatalogue(values), "utf8");
  return dir;
}

interface XcstringsFile {
  readonly strings: Record<string, { localizations: Record<string, { stringUnit?: unknown }> }>;
}

const readXcstrings = async (path: string): Promise<XcstringsFile> =>
  (await readJsonFile(path)) as XcstringsFile;

describe("pseudolocalize: a format whose writer only patches an existing document", () => {
  it("carries a key added to the source after the first run into the pseudolocale", async () => {
    const dir = await xliffProject(xliffUnit("a", "Alpha one"));
    await pseudolocalize({ config: xliffConfig(), cwd: dir });
    await writeFile(
      join(dir, "locales", "en.xlf"),
      xliffDocument("de", xliffUnit("a", "Alpha one") + xliffUnit("b", "Beta two")),
      "utf8",
    );

    const second = await pseudolocalize({ config: xliffConfig(), cwd: dir });
    const written = await readFile(second.path, "utf8");

    expect(second.entries).toBe(2);
    expect(written).toContain('id="b"');
    expect(written).toContain("Ḃéṫá ṫẃó");
  });

  it("converges: the run after a changed source rewrites nothing", async () => {
    const dir = await xliffProject(xliffUnit("a", "Alpha one"));
    await pseudolocalize({ config: xliffConfig(), cwd: dir });
    await writeFile(
      join(dir, "locales", "en.xlf"),
      xliffDocument("de", xliffUnit("a", "Alpha one") + xliffUnit("b", "Beta two")),
      "utf8",
    );
    const second = await pseudolocalize({ config: xliffConfig(), cwd: dir });
    const afterSecond = await readFile(second.path, "utf8");

    const third = await pseudolocalize({ config: xliffConfig(), cwd: dir });

    expect(second.written).toBe(true);
    expect(third.written).toBe(false);
    expect(await readFile(third.path, "utf8")).toBe(afterSecond);
  });

  it("reports a first run as written even when every value was copied verbatim", async () => {
    const dir = await xliffProject(xliffUnit("runaway", "a".repeat(40)));

    const result = await pseudolocalize({ config: xliffConfig(), cwd: dir });

    expect(result.copied).toEqual(["runaway"]);
    expect(result.written).toBe(true);
    expect(await readFile(result.path, "utf8")).toContain("a".repeat(40));
  });

  it("rewrites the seeded XLIFF target-language so the file describes what it holds", async () => {
    const dir = await xliffProject(xliffUnit("a", "Alpha one"), "de");

    const result = await pseudolocalize({ config: xliffConfig(), cwd: dir });
    const written = await readFile(result.path, "utf8");

    expect(written).toContain('target-language="en-XA"');
    expect(written).not.toContain('target-language="de"');
    expect(written).toContain('source-language="en"');
  });

  it("rewrites the 2.0 trgLang attribute as well", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(
      join(dir, "locales", "en.xlf"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="2.0" srcLang="en" trgLang="fr"><file id="f1"><unit id="a"><segment><source>Alpha one</source><target>Alpha one</target></segment></unit></file></xliff>\n`,
      "utf8",
    );

    const result = await pseudolocalize({ config: xliffConfig(), cwd: dir });

    expect(await readFile(result.path, "utf8")).toContain('trgLang="en-XA"');
  });

  it("carries a key added to a shared catalogue after the first run", async () => {
    const dir = await makeTempDir();
    const catalogue = (keys: readonly string[]): string =>
      `${JSON.stringify(
        {
          sourceLanguage: "en",
          version: "1.0",
          strings: Object.fromEntries(
            keys.map((key) => [
              key,
              {
                localizations: {
                  en: { stringUnit: { state: "translated", value: `Value for ${key}` } },
                },
              },
            ]),
          ),
        },
        null,
        2,
      )}\n`;
    const config = cfg({
      format: "apple-xcstrings",
      files: { pattern: "Localizable{locale}.xcstrings" },
    });
    await writeFile(join(dir, "Localizable.xcstrings"), catalogue(["a"]), "utf8");
    await pseudolocalize({ config, cwd: dir });
    await writeFile(join(dir, "Localizable.xcstrings"), catalogue(["a", "b"]), "utf8");

    const second = await pseudolocalize({ config, cwd: dir });
    const written = (await readJsonFile(second.path)) as {
      strings: Record<string, { localizations: Record<string, unknown> }>;
    };
    const third = await pseudolocalize({ config, cwd: dir });

    expect(written.strings.b?.localizations["en-XA"]).toBeDefined();
    expect(third.written).toBe(false);
  });
});

describe("pseudolocalize converges on the current source: xliff", () => {
  it("drops a key removed from the source out of the pseudolocale file", async () => {
    const dir = await xliffProject(xliffUnit("a", "Alpha one") + xliffUnit("b", "Beta two"));
    await pseudolocalize({ config: xliffConfig(), cwd: dir });
    await writeFile(
      join(dir, "locales", "en.xlf"),
      xliffDocument("de", xliffUnit("a", "Alpha one")),
      "utf8",
    );

    const second = await pseudolocalize({ config: xliffConfig(), cwd: dir });
    const written = await readFile(second.path, "utf8");
    const third = await pseudolocalize({ config: xliffConfig(), cwd: dir });

    expect(second.written).toBe(true);
    expect(second.entries).toBe(1);
    expect(written).not.toContain('id="b"');
    expect(written).not.toContain("Ḃéṫá");
    expect(written).toContain("Áĺṗĥá óńé");
    expect(third.written).toBe(false);
  });

  it("re-transforms a source value that changed between runs", async () => {
    const dir = await xliffProject(xliffUnit("a", "Alpha one"));
    await pseudolocalize({ config: xliffConfig(), cwd: dir });
    await writeFile(
      join(dir, "locales", "en.xlf"),
      xliffDocument("de", xliffUnit("a", "Gamma three")),
      "utf8",
    );

    const second = await pseudolocalize({ config: xliffConfig(), cwd: dir });
    const written = await readFile(second.path, "utf8");
    const third = await pseudolocalize({ config: xliffConfig(), cwd: dir });

    expect(second.written).toBe(true);
    expect(written).toContain("Ġáṁṁá ṫĥŕéé");
    expect(written).not.toContain("Áĺṗĥá óńé");
    expect(third.written).toBe(false);
  });

  it("matches a fresh run over the same source, whatever the history", async () => {
    const history = await xliffProject(xliffUnit("a", "Alpha one") + xliffUnit("gone", "Removed"));
    await pseudolocalize({ config: xliffConfig(), cwd: history });
    const final = xliffDocument("de", xliffUnit("a", "Alpha two") + xliffUnit("c", "Charlie four"));
    await writeFile(join(history, "locales", "en.xlf"), final, "utf8");
    await pseudolocalize({ config: xliffConfig(), cwd: history });

    const fresh = await makeTempDir();
    await mkdir(join(fresh, "locales"));
    await writeFile(join(fresh, "locales", "en.xlf"), final, "utf8");
    const freshResult = await pseudolocalize({ config: xliffConfig(), cwd: fresh });

    expect(await readFile(join(history, ".verbatra-local/pseudo/locales/en-XA.xlf"), "utf8")).toBe(
      await readFile(freshResult.path, "utf8"),
    );
  });

  it("creates the missing target element rather than reporting a write it did not make", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(
      join(dir, "locales", "en.xlf"),
      xliffDocument("de", '<trans-unit id="a"><source>Alpha one</source></trans-unit>'),
      "utf8",
    );

    const result = await pseudolocalize({ config: xliffConfig(), cwd: dir });
    const written = await readFile(result.path, "utf8");
    const second = await pseudolocalize({ config: xliffConfig(), cwd: dir });

    expect(result.transformed).toBe(1);
    expect(written).toContain("<target>[Áĺṗĥá óńé····]</target>");
    expect(second.written).toBe(false);
  });

  it("reports honestly on a repeated run where every entry is gate-refused", async () => {
    const dir = await xliffProject(xliffUnit("runaway", "a".repeat(40)));

    const first = await pseudolocalize({ config: xliffConfig(), cwd: dir });
    const second = await pseudolocalize({ config: xliffConfig(), cwd: dir });

    expect(first.written).toBe(true);
    expect(first.copied).toEqual(["runaway"]);
    expect(first.transformed).toBe(0);
    expect(second.written).toBe(false);
    expect(second.copied).toEqual(["runaway"]);
    expect(second.entries).toBe(1);
  });
});

describe("pseudolocalize converges on the current source: apple-xcstrings", () => {
  it("drops a key removed from the source out of the catalogue", async () => {
    const dir = await xcstringsProject({ a: "Alpha one", b: "Beta two" });
    await pseudolocalize({ config: xcstringsConfig(), cwd: dir });
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      xcstringsCatalogue({ a: "Alpha one" }),
      "utf8",
    );

    const second = await pseudolocalize({ config: xcstringsConfig(), cwd: dir });
    const written = await readXcstrings(second.path);
    const third = await pseudolocalize({ config: xcstringsConfig(), cwd: dir });

    expect(second.written).toBe(true);
    expect(second.entries).toBe(1);
    expect(written.strings.b).toBeUndefined();
    expect(written.strings.a?.localizations["en-XA"]).toBeDefined();
    expect(third.written).toBe(false);
  });

  it("re-transforms a source value that changed between runs", async () => {
    const dir = await xcstringsProject({ a: "Alpha one" });
    await pseudolocalize({ config: xcstringsConfig(), cwd: dir });
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      xcstringsCatalogue({ a: "Gamma three" }),
      "utf8",
    );

    const second = await pseudolocalize({ config: xcstringsConfig(), cwd: dir });
    const written = (await readJsonFile(second.path)) as {
      strings: Record<string, { localizations: Record<string, { stringUnit: { value: string } }> }>;
    };
    const third = await pseudolocalize({ config: xcstringsConfig(), cwd: dir });

    expect(second.written).toBe(true);
    expect(written.strings.a?.localizations["en-XA"]?.stringUnit.value).toBe("[Ġáṁṁá ṫĥŕéé····]");
    expect(third.written).toBe(false);
  });

  it("matches a fresh run over the same source, whatever the history", async () => {
    const history = await xcstringsProject({ a: "Alpha one", gone: "Removed" });
    await pseudolocalize({ config: xcstringsConfig(), cwd: history });
    const final = xcstringsCatalogue({ a: "Alpha two", c: "Charlie four" });
    await writeFile(join(history, "Localizable.xcstrings"), final, "utf8");
    const historyResult = await pseudolocalize({ config: xcstringsConfig(), cwd: history });

    const fresh = await xcstringsProject({ a: "Alpha two", c: "Charlie four" });
    const freshResult = await pseudolocalize({ config: xcstringsConfig(), cwd: fresh });

    expect(await readFile(historyResult.path, "utf8")).toBe(
      await readFile(freshResult.path, "utf8"),
    );
  });

  it("reports honestly on a repeated run where every entry is gate-refused", async () => {
    const dir = await xcstringsProject({ runaway: "a".repeat(40) });

    const first = await pseudolocalize({ config: xcstringsConfig(), cwd: dir });
    const second = await pseudolocalize({ config: xcstringsConfig(), cwd: dir });

    expect(first.written).toBe(true);
    expect(first.copied).toEqual(["runaway"]);
    expect(first.transformed).toBe(0);
    expect(second.written).toBe(false);
    expect(second.copied).toEqual(["runaway"]);
    expect(second.entries).toBe(1);
  });
});

describe("pseudolocalize: the output directory stays inside the project", () => {
  it("refuses an absolute output directory", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      pseudolocalize({ config: cfg(), cwd: dir, out: join(dir, "elsewhere") }),
    ).rejects.toMatchObject({ code: "PSEUDO_OUTPUT_CONFLICT" });
  });

  it("refuses an output directory that climbs out of the working directory", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      pseudolocalize({ config: cfg(), cwd: dir, out: "../escaped" }),
    ).rejects.toMatchObject({ code: "PSEUDO_OUTPUT_CONFLICT" });
  });

  it("refuses a path that climbs out only after a redundant segment", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      pseudolocalize({ config: cfg(), cwd: dir, out: "./foo/../../escaped" }),
    ).rejects.toMatchObject({ code: "PSEUDO_OUTPUT_CONFLICT" });
  });

  it("normalises a redundant segment that stays inside rather than refusing it", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir, out: "./foo/../bar" });

    expect(result.path).toBe(join(dir, "bar", "locales", "en-XA.json"));
    expect(await readJsonFile(result.path)).toEqual({ greeting: "[Ĥéĺĺó··]" });
  });

  it("normalises a trailing separator rather than refusing it", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir, out: "build/pseudo/" });

    expect(result.path).toBe(join(dir, "build", "pseudo", "locales", "en-XA.json"));
  });

  it("refuses the working directory itself, which would land the output beside the real locale files", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(pseudolocalize({ config: cfg(), cwd: dir, out: "." })).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
    });
  });

  it("refuses an output directory that already holds a configured locale file", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      pseudolocalize({ config: cfg(), cwd: dir, out: "locales/.." }),
    ).rejects.toMatchObject({ code: "PSEUDO_OUTPUT_CONFLICT" });
  });

  it("accepts a directory whose name merely begins with two dots", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir, out: "..pseudo" });

    expect(result.path).toBe(join(dir, "..pseudo", "locales", "en-XA.json"));
    expect(await readJsonFile(result.path)).toEqual({ greeting: "[Ĥéĺĺó\u00b7\u00b7]" });
  });
});

describe("pseudolocalize: a seed that cannot be written is reported as unwritable", () => {
  it("maps a failed XLIFF seed write to TARGET_UNWRITABLE rather than leaking the raw error", async () => {
    const dir = await xliffProject(xliffUnit("a", "Alpha one"));
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    });

    await expect(pseudolocalize({ config: xliffConfig(), cwd: dir }, { fs })).rejects.toMatchObject(
      { code: "TARGET_UNWRITABLE" },
    );
  });
});

describe("pseudolocalize: vue-i18n packs plural forms into one value", () => {
  it("marks and expands each pipe-separated form on its own", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { car: "car | cars" });
    const config = cfg({ format: "vue-i18n-json" });

    const result = await pseudolocalize({ config, cwd: dir });
    const written = (await readJsonFile(result.path)) as Record<string, string>;

    expect(written.car).toBe("[ćáŕ··] | [ćáŕś··]");
  });

  const vueProject = async (values: Record<string, string>): Promise<string> => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), values);
    return dir;
  };

  const vueConfig = (): VerbatraConfig => cfg({ format: "vue-i18n-json" });

  const vueOutput = async (dir: string): Promise<Record<string, string>> => {
    const result = await pseudolocalize({ config: vueConfig(), cwd: dir });
    return (await readJsonFile(result.path)) as Record<string, string>;
  };

  it("splits a literal pipe that was never a plural, because the runtime does too", async () => {
    const dir = await vueProject({ filter: "Search | Results" });

    const written = await vueOutput(dir);

    expect(written.filter).toBe("[Śéáŕćĥ···] | [Ŕéśúĺṫś···]");
    expect(written.filter?.split("|")).toHaveLength(2);
  });

  it("keeps an empty plural form empty rather than marking a blank run", async () => {
    const dir = await vueProject({ gapped: "a || b" });

    const written = await vueOutput(dir);

    expect(written.gapped).toBe("[á·] || [ḃ·]");
    expect(written.gapped?.split("|")[1]).toBe("");
  });

  it("preserves a leading and a trailing pipe instead of dropping the empty form", async () => {
    const dir = await vueProject({ leading: "| one", trailing: "one |" });

    const written = await vueOutput(dir);

    expect(written.leading).toBe("| [óńé··]");
    expect(written.trailing).toBe("[óńé··] |");
    expect(written.leading?.split("|")).toHaveLength(2);
    expect(written.trailing?.split("|")).toHaveLength(2);
  });

  it("keeps a named placeholder whole in every form it appears in", async () => {
    const dir = await vueProject({ items: "{count} items | {count} item" });

    const written = await vueOutput(dir);

    expect(written.items).toBe("[{count} íṫéṁś···] | [{count} íṫéṁ··]");
  });

  it("does not split a brace group the adapter does not read as a placeholder", async () => {
    const dir = await vueProject({ piped: "Hello {a|b} there" });
    const config = vueConfig();

    const result = await pseudolocalize({ config, cwd: dir });
    const written = (await readJsonFile(result.path)) as Record<string, string>;

    expect(result.copied).toEqual([]);
    expect(written.piped).toBe("[Ĥéĺĺó {a|b} ṫĥéŕé\u00b7\u00b7\u00b7\u00b7\u00b7]");
    expect(written.piped).toContain("{a|b}");
  });

  it("preserves the vue-i18n literal escape for a pipe rather than splitting through it", async () => {
    const dir = await vueProject({ escaped: "Yes {'|'} No" });
    const config = vueConfig();

    const result = await pseudolocalize({ config, cwd: dir });
    const written = (await readJsonFile(result.path)) as Record<string, string>;

    expect(result.copied).toEqual([]);
    expect(written.escaped).toBe("[Ýéś {'|'} Ńó\u00b7\u00b7\u00b7]");
    expect(written.escaped).toContain("{'|'}");
  });

  it("does not split a linked-message group whose key list holds a pipe", async () => {
    const dir = await vueProject({ linked: "@:(foo|bar)" });

    const written = await vueOutput(dir);

    expect(written.linked).toBe("[@:(foo|bar)]");
  });

  it("still splits a top-level pipe that sits outside every group", async () => {
    const dir = await vueProject({ mixed: "{a|b} one | {a|b} many" });

    const written = await vueOutput(dir);

    expect(written.mixed?.split("|").length).toBe(5);
    expect(written.mixed).toBe("[{a|b} óńé\u00b7\u00b7] | [{a|b} ṁáńý\u00b7\u00b7\u00b7]");
  });

  it("the split pipe-in-placeholder values still converge on a second run", async () => {
    const dir = await vueProject({ piped: "Hello {a|b} there", escaped: "Yes {'|'} No" });
    const config = vueConfig();

    const first = await pseudolocalize({ config, cwd: dir });
    const second = await pseudolocalize({ config, cwd: dir });

    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
  });

  it("leaves a value with no plural forms as one marked run", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello {name}" });
    const config = cfg({ format: "vue-i18n-json" });

    const result = await pseudolocalize({ config, cwd: dir });
    const written = (await readJsonFile(result.path)) as Record<string, string>;

    expect(written.greeting).toBe("[Ĥéĺĺó {name}···]");
  });
});

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { checkFile } from "./check-file.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], ...overrides });

async function project(files: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(dir, relativePath);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  return dir;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("checkFile: a target locale file", () => {
  it("reports a clean file with the per-locale report shape of check --qa", async () => {
    const dir = await project({
      "locales/en.json": json({ greeting: "Hello {{name}}" }),
      "locales/de.json": json({ greeting: "Hallo {{name}}" }),
    });

    const summary = await checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" });

    expect(summary).toEqual({
      file: join("locales", "de.json"),
      role: "target",
      locales: [
        {
          locale: "de",
          incompletePlurals: [],
          qa: { checked: 1, errors: 0, warnings: 0, findings: [] },
        },
      ],
      qa: { errors: 0, warnings: 0, invalidSourceKeys: [] },
    });
  });

  it("reports a broken placeholder as an integrity error, given an absolute path", async () => {
    const dir = await project({
      "locales/en.json": json({ greeting: "Hello {{name}}", title: "Settings" }),
      "locales/de.json": json({ greeting: "Hallo {{nom}}", title: "Einstellungen" }),
    });

    const summary = await checkFile({
      config: cfg(),
      cwd: dir,
      file: join(dir, "locales", "de.json"),
    });

    expect(summary.locales[0]?.qa.findings).toEqual([
      {
        key: "greeting",
        severity: "error",
        reason: "placeholder",
        details: ["-{{name}}", "+{{nom}}"],
      },
    ]);
    expect(summary.qa.errors).toBe(1);
  });

  it("reports review reasons as warnings unless the severity floor is error", async () => {
    const dir = await project({
      "locales/en.json": json({ copy: "Delete account" }),
      "locales/de.json": json({ copy: "Delete account" }),
    });
    const input = { config: cfg(), cwd: dir, file: "locales/de.json" };

    expect((await checkFile(input)).qa.warnings).toBeGreaterThan(0);
    expect((await checkFile({ ...input, qaSeverity: "error" })).qa.warnings).toBe(0);
  });

  it("lists a plural that lacks categories the target language uses", async () => {
    const dir = await project({
      "locales/en.json": json({ items_one: "{{count}} item", items_other: "{{count}} items" }),
      "locales/pl.json": json({ items_one: "{{count}} rzecz", items_other: "{{count}} rzeczy" }),
    });

    const summary = await checkFile({
      config: cfg({ targetLocales: ["pl"] }),
      cwd: dir,
      file: "locales/pl.json",
    });

    expect(summary.locales[0]?.incompletePlurals.map((plural) => plural.key)).toEqual(["items"]);
  });

  it("turns malformed JSON into a located syntax finding instead of throwing", async () => {
    const dir = await project({
      "locales/en.json": json({ greeting: "Hello" }),
      "locales/de.json": '{\n  "greeting": "Hallo"\n  "title": "Titel"\n}\n',
    });

    const summary = await checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" });

    expect(summary.locales).toEqual([
      {
        locale: "de",
        incompletePlurals: [],
        qa: {
          checked: 0,
          errors: 1,
          warnings: 0,
          findings: [
            {
              severity: "error",
              reason: "syntax",
              code: "INVALID_JSON",
              message: "The file is not valid JSON (line 3, column 3).",
              line: 3,
              column: 3,
            },
          ],
        },
      },
    ]);
    expect(summary.qa).toEqual({ errors: 1, warnings: 0, invalidSourceKeys: [] });
  });

  it("reports a syntax finding without a position when the parser gives none", async () => {
    const dir = await project({
      "locales/en.json": json({ greeting: "Hello" }),
      "locales/de.json": '{"greeting": Hallo}',
    });

    const summary = await checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" });

    expect(summary.locales[0]?.qa.findings).toEqual([
      {
        severity: "error",
        reason: "syntax",
        code: "INVALID_JSON",
        message: "The file is not valid JSON.",
      },
    ]);
  });

  it("does not need the source locale file to report the target's own syntax error", async () => {
    const dir = await project({ "locales/de.json": "{" });

    const summary = await checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" });

    expect(summary.qa.errors).toBe(1);
  });

  it("fails with SOURCE_UNREADABLE when a parseable target has no source to hold it against", async () => {
    const dir = await project({ "locales/de.json": json({ greeting: "Hallo" }) });

    const error = await thrownBy(checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" }));

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("SOURCE_UNREADABLE");
  });

  it("reads only the named file and the source, and writes nothing", async () => {
    const dir = await project({
      "locales/en.json": json({ greeting: "Hello {{name}}" }),
      "locales/de.json": json({ greeting: "Hallo" }),
      "locales/fr.json": json({ greeting: "Bonjour" }),
      "verbatra.lock.json": "not even json",
    });
    const reads: string[] = [];
    const refuse = async (): Promise<never> => {
      throw new Error("checkFile must not write");
    };
    const disk = realDiskReads();
    const fs = makeFakeFs({
      ...disk,
      readFileBounded: (path, maxBytes) => {
        reads.push(path);
        return disk.readFileBounded(path, maxBytes);
      },
      writeFile: refuse,
      writeBytes: refuse,
      createExclusive: refuse,
      deleteFile: refuse,
    });

    const summary = await checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" }, { fs });

    expect(summary.qa.errors).toBe(1);
    expect(reads.sort()).toEqual([
      join(dir, "locales", "de.json"),
      join(dir, "locales", "en.json"),
    ]);
  });

  it("passes on a read failure that is not the file's own fault", async () => {
    const dir = await project({ "locales/de.json": json({}) });
    const fs = makeFakeFs({
      ...realDiskReads(),
      readFileBounded: async () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      },
    });

    const error = await thrownBy(
      checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" }, { fs }),
    );

    expect((error as Error).message).toContain("permission denied");
  });
});

describe("checkFile: the source locale file", () => {
  it("checks the source for syntax alone and lists its invalid ICU keys", async () => {
    const dir = await project({
      "messages/en.json": json({ ok: "Hi {name}", broken: "{count, plural, one {x}" }),
    });

    const summary = await checkFile({
      config: cfg({ format: "next-intl-json", files: { pattern: "messages/{locale}.json" } }),
      cwd: dir,
      file: "messages/en.json",
    });

    expect(summary.role).toBe("source");
    expect(summary.locales).toEqual([
      {
        locale: "en",
        incompletePlurals: [],
        qa: { checked: 0, errors: 0, warnings: 0, findings: [] },
      },
    ]);
    expect(summary.qa.invalidSourceKeys).toEqual(["broken"]);
  });

  it("reports a malformed source as a syntax finding", async () => {
    const dir = await project({ "locales/en.yml": "a: [unclosed\n" });

    const summary = await checkFile({
      config: cfg({ format: "yaml", files: { pattern: "locales/{locale}.yml" } }),
      cwd: dir,
      file: "locales/en.yml",
    });

    expect(summary.role).toBe("source");
    expect(summary.locales[0]?.qa.findings[0]).toMatchObject({
      severity: "error",
      reason: "syntax",
      code: "INVALID_YAML",
    });
  });
});

describe("checkFile: a path that is not a locale file", () => {
  it.each([
    ["a file outside the pattern", "src/de.json"],
    ["an unconfigured locale", "locales/it.json"],
  ])("refuses %s with NOT_A_LOCALE_FILE", async (_label, file) => {
    const dir = await project({ [file]: json({}) });

    const error = await thrownBy(checkFile({ config: cfg(), cwd: dir, file }));

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("NOT_A_LOCALE_FILE");
    expect((error as SdkError).message).toContain("locales/{locale}.json");
  });

  it("refuses a configured locale whose file does not exist", async () => {
    const dir = await project({ "locales/en.json": json({}) });

    const error = await thrownBy(checkFile({ config: cfg(), cwd: dir, file: "locales/fr.json" }));

    expect((error as SdkError).code).toBe("NOT_A_LOCALE_FILE");
    expect((error as SdkError).message).toBe(
      `${join("locales", "fr.json")} is not a locale file of this project: no file exists at that path.`,
    );
  });
});

describe("checkFile: a shared catalogue", () => {
  const catalogueConfig = cfg({
    format: "apple-xcstrings",
    files: { pattern: "Localizable{locale}.xcstrings" },
  });

  function catalogue(de: string, fr: string): string {
    const unit = (value: string) => ({ stringUnit: { state: "translated", value } });
    return json({
      sourceLanguage: "en",
      version: "1.0",
      strings: {
        greeting: {
          localizations: { en: unit("Hello %@"), de: unit(de), fr: unit(fr) },
        },
      },
    });
  }

  it("checks every target locale the catalogue holds", async () => {
    const dir = await project({ "Localizable.xcstrings": catalogue("Hallo", "Bonjour %@") });

    const summary = await checkFile({
      config: catalogueConfig,
      cwd: dir,
      file: "Localizable.xcstrings",
    });

    expect(summary.role).toBe("catalogue");
    expect(summary.locales.map((entry) => [entry.locale, entry.qa.errors])).toEqual([
      ["de", 1],
      ["fr", 0],
    ]);
    expect(summary.qa.errors).toBe(1);
  });

  it("reports a malformed catalogue once, under the source locale", async () => {
    const dir = await project({ "Localizable.xcstrings": '{"sourceLanguage": "en",}' });

    const summary = await checkFile({
      config: catalogueConfig,
      cwd: dir,
      file: "Localizable.xcstrings",
    });

    expect(summary.locales).toHaveLength(1);
    expect(summary.locales[0]?.locale).toBe("en");
    expect(summary.locales[0]?.qa.findings[0]).toMatchObject({ reason: "syntax", line: 1 });
  });

  it("refuses any other file with NOT_A_LOCALE_FILE", async () => {
    const dir = await project({ "Other.xcstrings": catalogue("Hallo", "Bonjour") });

    const error = await thrownBy(
      checkFile({ config: catalogueConfig, cwd: dir, file: "Other.xcstrings" }),
    );

    expect((error as SdkError).code).toBe("NOT_A_LOCALE_FILE");
  });
});

describe("checkFile: the default working directory", () => {
  it("resolves the file against the process working directory", async () => {
    const error = await thrownBy(
      checkFile({ config: cfg(), file: "definitely/not/a/locale/de.json" }),
    );

    expect((error as SdkError).code).toBe("NOT_A_LOCALE_FILE");
  });
});

describe("checkFile: relative messages", () => {
  it("writes a file path in an adapter message relative to the working directory", async () => {
    const dir = await project({ "Localizable.xcstrings": "{" });
    await writeJsonFile(join(dir, "unused.json"), {});

    const summary = await checkFile({
      config: cfg({
        format: "apple-xcstrings",
        files: { pattern: "Localizable{locale}.xcstrings" },
      }),
      cwd: dir,
      file: "Localizable.xcstrings",
    });

    const finding = summary.locales[0]?.qa.findings[0];
    expect(finding).toMatchObject({ reason: "syntax" });
    expect(JSON.stringify(finding)).not.toContain(dir);
  });
});

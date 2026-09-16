// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SUPPORTED_FORMATS } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { ExtractionConfig } from "../config/extraction-config.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import {
  baseConfig,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { extract } from "./extract.js";
import { EXTRACT_NOT_CONFIGURED_MESSAGE } from "./source-scan.js";

const EXTRACT_CONFIG = { framework: "i18next", roots: ["src"] } satisfies ExtractionConfig;

async function project(files: Readonly<Record<string, string>>): Promise<string> {
  const cwd = await makeTempDir();
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(cwd, relativePath);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return cwd;
}

function config(overrides: Record<string, unknown> = {}) {
  return baseConfig({ extract: EXTRACT_CONFIG, ...overrides });
}

describe("extract on a project with no source catalog", () => {
  it("creates the source locale file at the resolved path", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home", "Home");' });

    const result = await extract({ config: config(), cwd });

    expect(result.written).toBe(true);
    expect(await readJsonFile(join(cwd, "locales/en.json"))).toEqual({ nav: { home: "Home" } });
    expect(result.added).toEqual([{ key: "nav.home", value: "Home", file: "src/nav.ts", line: 1 }]);
  });

  it("writes an empty value for a call site with no default and reports the key", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home");' });

    const result = await extract({ config: config(), cwd });

    expect(await readJsonFile(join(cwd, "locales/en.json"))).toEqual({ nav: { home: "" } });
    expect(result.withoutDefault).toEqual(["nav.home"]);
  });

  it("never writes a target locale file", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home", "Home");' });

    await extract({ config: config(), cwd });

    expect(await defaultFs.fileExists(join(cwd, "locales/de.json"))).toBe(false);
  });
});

describe("extract on a project that already has a source catalog", () => {
  it("keeps an existing value byte-for-byte and only appends genuinely new keys", async () => {
    const cwd = await project({
      "src/nav.ts": 't("nav.home", "Ignored");\nt("nav.away", "Away");',
    });
    await mkdir(join(cwd, "locales"), { recursive: true });
    await writeJsonFile(join(cwd, "locales/en.json"), { nav: { home: "Edited by hand" } });

    const result = await extract({ config: config(), cwd });

    expect(await readJsonFile(join(cwd, "locales/en.json"))).toEqual({
      nav: { home: "Edited by hand", away: "Away" },
    });
    expect(result.added.map((entry) => entry.key)).toEqual(["nav.away"]);
    expect(result.existingKeys).toBe(1);
  });

  it("rewrites nothing when every key is already present", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home", "Home");' });
    await mkdir(join(cwd, "locales"), { recursive: true });
    await writeJsonFile(join(cwd, "locales/en.json"), { nav: { home: "Home" } });
    const before = await readTextFile(join(cwd, "locales/en.json"));

    const result = await extract({ config: config(), cwd });

    expect(result.added).toEqual([]);
    expect(result.written).toBe(false);
    expect(await readTextFile(join(cwd, "locales/en.json"))).toBe(before);
  });

  it("calls no write at all on a run that adds nothing", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home", "Home");' });
    await mkdir(join(cwd, "locales"), { recursive: true });
    await writeJsonFile(join(cwd, "locales/en.json"), { nav: { home: "Home" } });
    const writes: string[] = [];
    const fs: SdkFs = { ...defaultFs, writeFile: async (path) => void writes.push(path) };

    await extract({ config: config(), cwd }, { fs });

    expect(writes).toEqual([]);
  });

  it("routes the write through the same fs member when a run does add a key", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home", "Home");' });
    await mkdir(join(cwd, "locales"), { recursive: true });
    await writeJsonFile(join(cwd, "locales/en.json"), {});
    const writes: string[] = [];
    const fs: SdkFs = { ...defaultFs, writeFile: async (path) => void writes.push(path) };

    await extract({ config: config(), cwd }, { fs });

    expect(writes).toEqual([join(cwd, "locales/en.json")]);
  });

  it("leaves a catalog key that no call site mentions untouched", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home", "Home");' });
    await mkdir(join(cwd, "locales"), { recursive: true });
    await writeJsonFile(join(cwd, "locales/en.json"), { nav: { home: "Home", gone: "Gone" } });

    await extract({ config: config(), cwd });

    expect(await readJsonFile(join(cwd, "locales/en.json"))).toEqual({
      nav: { home: "Home", gone: "Gone" },
    });
  });
});

describe("extract reporting", () => {
  it("reports a dynamic key argument rather than writing a guessed key", async () => {
    const cwd = await project({ "src/nav.ts": "t(section);" });

    const result = await extract({ config: config(), cwd });

    expect(result.dynamic).toEqual([{ file: "src/nav.ts", line: 1 }]);
    expect(result.added).toEqual([]);
  });

  it("reports one key with two different defaults as a conflict", async () => {
    const cwd = await project({
      "src/a.ts": 't("nav.home", "Home");',
      "src/b.ts": 't("nav.home", "Start");',
    });

    const result = await extract({ config: config(), cwd });

    expect(result.conflicts).toEqual([
      {
        key: "nav.home",
        values: ["Home", "Start"],
        locations: [
          { file: "src/a.ts", line: 1 },
          { file: "src/b.ts", line: 1 },
        ],
      },
    ]);
  });

  it("never returns a source-file body, only keys, values, and locations", async () => {
    const marker = "a secret literal that must not travel";
    const cwd = await project({ "src/nav.ts": `const note = "${marker}";\nt("nav.home");` });

    const result = await extract({ config: config(), cwd });

    expect(JSON.stringify(result)).not.toContain(marker);
  });

  it("reports the source path relative to the working directory", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home");' });

    const result = await extract({ config: config(), cwd });

    expect(result.sourcePath).toBe("locales/en.json");
  });
});

describe("extract on JSX text with apostrophes", () => {
  it("reads the call after JSX text holding apostrophes without an unparseable diagnostic", async () => {
    const cwd = await project({
      "src/welcome.tsx":
        "export const Welcome = () => (\n  <div>\n    <p>We're glad you're here</p>\n    <p>Don't worry</p>\n  </div>\n);\nt(\"a\");\n",
    });

    const result = await extract({ config: config(), cwd, dryRun: true });

    expect(result.diagnostics).toEqual([]);
    expect(result.added.map((entry) => entry.key)).toEqual(["a"]);
  });
});

describe("extract on markup files holding apostrophes", () => {
  it.each(["src/card.tsx", "src/card.jsx", "src/card.js"])(
    "reads the calls in %s without an unparseable diagnostic",
    async (file) => {
      const cwd = await project({
        [file]:
          'export const Card = () => (\n  <div title="it\'s" aria-label=\'We are "here"\'>\n    <p>Don\'t worry, we\'re here</p>\n    <p>{t("card.body", "Body")}</p>\n  </div>\n);\nt("card.title");\n',
      });

      const result = await extract({ config: config(), cwd, dryRun: true });

      expect(result.diagnostics).toEqual([]);
      expect(result.added.map((entry) => entry.key)).toEqual(["card.body", "card.title"]);
    },
  );
});

describe("extract dry run", () => {
  it("reports what would be added and writes nothing", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home", "Home");' });

    const result = await extract({ config: config(), cwd, dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.written).toBe(false);
    expect(result.added.map((entry) => entry.key)).toEqual(["nav.home"]);
    expect(await defaultFs.fileExists(join(cwd, "locales/en.json"))).toBe(false);
  });
});

describe("extract scan boundaries", () => {
  it("never walks node_modules", async () => {
    const cwd = await project({
      "src/nav.ts": 't("nav.home");',
      "src/node_modules/vendor/index.ts": 't("vendor.key");',
    });

    const result = await extract({ config: config(), cwd });

    expect(result.added.map((entry) => entry.key)).toEqual(["nav.home"]);
  });

  it("reads nothing outside the configured roots", async () => {
    const cwd = await project({
      "src/nav.ts": 't("nav.home");',
      "scripts/build.ts": 't("build.key");',
    });

    const result = await extract({ config: config(), cwd });

    expect(result.added.map((entry) => entry.key)).toEqual(["nav.home"]);
  });

  it("honours the configured exclude list", async () => {
    const cwd = await project({
      "src/nav.ts": 't("nav.home");',
      "src/generated/schema.ts": 't("generated.key");',
    });

    const result = await extract({
      config: config({ extract: { framework: "i18next", roots: ["src"], exclude: ["generated"] } }),
      cwd,
    });

    expect(result.added.map((entry) => entry.key)).toEqual(["nav.home"]);
  });

  it("reports a missing root as a diagnostic rather than failing the run", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home");' });

    const result = await extract({
      config: config({ extract: { framework: "i18next", roots: ["src", "app"] } }),
      cwd,
    });

    expect(result.diagnostics).toEqual([{ file: "app", reason: "unreadable-directory" }]);
    expect(result.added.map((entry) => entry.key)).toEqual(["nav.home"]);
  });
});

describe("extract failure modes", () => {
  it("refuses to run when the config has no extract block", async () => {
    const cwd = await project({});

    await expect(extract({ config: baseConfig(), cwd })).rejects.toMatchObject({
      code: "EXTRACT_NOT_CONFIGURED",
      message: EXTRACT_NOT_CONFIGURED_MESSAGE,
    });
    expect(EXTRACT_NOT_CONFIGURED_MESSAGE).toContain("No extract block is configured");
  });

  it("refuses to run against a file system that cannot list a directory", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home");' });
    const { readDirectory, ...withoutReadDirectory } = defaultFs;

    const failure = await extract({ config: config(), cwd }, { fs: withoutReadDirectory }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(SdkError);
    expect((failure as SdkError).code).toBe("EXTRACT_FS_UNSUPPORTED");
    expect((failure as SdkError).message).toContain("readDirectory");
  });

  it("reports an unparseable existing source catalog as SOURCE_INVALID", async () => {
    const cwd = await project({ "src/nav.ts": 't("nav.home");', "locales/en.json": "{ not json" });

    await expect(extract({ config: config(), cwd })).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
  });
});

describe("extract across every supported format", () => {
  const creatable: Readonly<Record<string, string>> = {
    "i18next-json": "locales/{locale}.json",
    "vue-i18n-json": "locales/{locale}.json",
    "next-intl-json": "messages/{locale}.json",
    "ngx-translate-json": "i18n/{locale}.json",
    yaml: "locales/{locale}.yml",
    arb: "lib/l10n/app_{locale}.arb",
    properties: "locales/messages_{locale}.properties",
    "apple-strings": "{locale}.lproj/Localizable.strings",
    "android-xml": "res/values-{locale}/strings.xml",
    "gettext-po": "locales/{locale}.po",
    ini: "locales/{locale}.ini",
    resx: "Resources/Strings.{locale}.resx",
  };

  const seeded: Readonly<
    Record<string, { readonly pattern: string; readonly at: string; readonly seed: string }>
  > = {
    xliff: {
      pattern: "locales/{locale}.xlf",
      at: "locales/en.xlf",
      seed: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" target-language="en" datatype="plaintext"><body>
<trans-unit id="seeded"><source>Seeded</source><target>Seeded</target></trans-unit>
</body></file></xliff>`,
    },
    "apple-xcstrings": {
      pattern: "Localizable{locale}.xcstrings",
      at: "Localizable.xcstrings",
      seed: JSON.stringify({
        sourceLanguage: "en",
        version: "1.0",
        strings: {
          seeded: {
            localizations: { en: { stringUnit: { state: "translated", value: "Seeded" } } },
          },
        },
      }),
    },
  };

  it.each(Object.entries(creatable))(
    "creates and populates a %s source catalog through the adapter write path",
    async (format, pattern) => {
      const cwd = await project({ "src/nav.ts": 't("navHome", "Home");' });

      const result = await extract({ config: config({ format, files: { pattern } }), cwd });

      expect(result.written).toBe(true);
      expect(result.added.map((entry) => entry.key)).toEqual(["navHome"]);
    },
  );

  it.each(Object.entries(seeded))(
    "appends to an existing %s source catalog through the adapter write path",
    async (format, { pattern, at, seed }) => {
      const cwd = await project({ "src/nav.ts": 't("navHome", "Home");', [at]: seed });

      const result = await extract({ config: config({ format, files: { pattern } }), cwd });

      expect(result.written).toBe(true);
      expect(result.added.map((entry) => entry.key)).toEqual(["navHome"]);
      expect(result.existingKeys).toBe(0);
    },
  );

  it("covers every format the core union declares", () => {
    expect([...Object.keys(creatable), ...Object.keys(seeded)].sort()).toEqual(
      [...SUPPORTED_FORMATS].sort(),
    );
  });
});

describe("extract on a format that cannot create its catalog", () => {
  it("reports an unwritable source catalog as a structured error", async () => {
    const cwd = await project({ "src/nav.ts": 't("navHome", "Home");' });

    await expect(
      extract({
        config: config({ format: "xliff", files: { pattern: "locales/{locale}.xlf" } }),
        cwd,
      }),
    ).rejects.toMatchObject({ code: "SOURCE_UNWRITABLE" });
  });
});

describe("extract on a conflicted key", () => {
  it("writes neither value and leaves the key out of the additions", async () => {
    const cwd = await project({
      "src/a.ts": 't("nav.home", "Home");',
      "src/b.ts": 't("nav.home", "Start");\nt("nav.away", "Away");',
    });

    const result = await extract({ config: config(), cwd });

    expect(result.added.map((entry) => entry.key)).toEqual(["nav.away"]);
    expect(await readJsonFile(join(cwd, "locales/en.json"))).toEqual({ nav: { away: "Away" } });
    expect(result.conflicts.map((entry) => entry.key)).toEqual(["nav.home"]);
  });
});

describe("extract on a file of call shapes it cannot resolve whole", () => {
  const UNRESOLVABLE = [
    't("nav.home", "Home");',
    't("user." + id);',
    "t(`nav.${section}`);",
    't(open ? "a.one" : "a.two");',
    't(prefixed("b.one"));',
    't(("c.one"));',
    't("common:d.one", "D");',
    "t(sectionKey);",
    't("e.one',
    't("");',
    "t(`nav.tpl`);",
    't("nav.trail",);',
    't("nav.away", "Away");',
  ].join("\n");

  it("writes exactly the keys it resolved whole and nothing else", async () => {
    const cwd = await project({ "src/nav.ts": `${UNRESOLVABLE}\n` });

    const result = await extract({ config: config(), cwd });

    expect(result.added).toEqual([
      { key: "nav.home", value: "Home", file: "src/nav.ts", line: 1 },
      { key: "nav.tpl", value: "", file: "src/nav.ts", line: 11 },
      { key: "nav.trail", value: "", file: "src/nav.ts", line: 12 },
      { key: "nav.away", value: "Away", file: "src/nav.ts", line: 13 },
    ]);
    expect(await readTextFile(join(cwd, "locales/en.json"))).toBe(
      '{\n  "nav": {\n    "home": "Home",\n    "tpl": "",\n    "trail": "",\n    "away": "Away"\n  }\n}\n',
    );
  });

  it("drops an empty key without adding it and without reporting it as dynamic", async () => {
    const cwd = await project({ "src/nav.ts": `${UNRESOLVABLE}\n` });

    const result = await extract({ config: config(), cwd });

    expect(result.added.map((entry) => entry.key)).not.toContain("");
    expect(result.withoutDefault).toEqual(["nav.tpl", "nav.trail"]);
    expect(result.dynamic).not.toContainEqual({ file: "src/nav.ts", line: 10 });
  });

  it("reports every shape it could not resolve as a dynamic call site", async () => {
    const cwd = await project({ "src/nav.ts": `${UNRESOLVABLE}\n` });

    const result = await extract({ config: config(), cwd });

    expect(result.dynamic).toEqual([
      { file: "src/nav.ts", line: 2 },
      { file: "src/nav.ts", line: 3 },
      { file: "src/nav.ts", line: 4 },
      { file: "src/nav.ts", line: 5 },
      { file: "src/nav.ts", line: 6 },
      { file: "src/nav.ts", line: 7 },
      { file: "src/nav.ts", line: 8 },
      { file: "src/nav.ts", line: 9 },
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("writes no catalog at all when every call site is unresolvable", async () => {
    const cwd = await project({
      "src/nav.ts": 't("user." + id);\nt(`nav.${section}`);\nt("common:a.one");\n',
    });

    const result = await extract({ config: config(), cwd });

    expect(result.added).toEqual([]);
    expect(result.written).toBe(false);
    expect(await defaultFs.fileExists(join(cwd, "locales/en.json"))).toBe(false);
  });

  it("records no default for a concatenated default and still writes the key", async () => {
    const cwd = await project({
      "src/nav.ts":
        't("nav.home", "Home" + suffix);\nt("nav.away", { defaultValue: "Away" + suffix });\n',
    });

    const result = await extract({ config: config(), cwd });

    expect(result.withoutDefault).toEqual(["nav.home", "nav.away"]);
    expect(await readTextFile(join(cwd, "locales/en.json"))).toBe(
      '{\n  "nav": {\n    "home": "",\n    "away": ""\n  }\n}\n',
    );
  });
});

describe("extract on a whole key that carries an empty dot segment", () => {
  it("reports it as dynamic and writes no catalog at all", async () => {
    const cwd = await project({ "src/nav.ts": 't("user.");\nt(".lead");\nt("a..b");' });

    const result = await extract({ config: config(), cwd });

    expect(result.added).toEqual([]);
    expect(result.written).toBe(false);
    expect(result.dynamic).toEqual([
      { file: "src/nav.ts", line: 1 },
      { file: "src/nav.ts", line: 2 },
      { file: "src/nav.ts", line: 3 },
    ]);
    await expect(readJsonFile(join(cwd, "locales/en.json"))).rejects.toThrow();
  });

  it("leaves a key already in the catalog under an empty segment untouched", async () => {
    const cwd = await project({ "src/nav.ts": 't("user.");\nt("nav.home", "Home");' });
    await mkdir(join(cwd, "locales"), { recursive: true });
    await writeJsonFile(join(cwd, "locales/en.json"), { user: { "": "hand written" } });

    const result = await extract({ config: config(), cwd });

    expect(result.added.map((entry) => entry.key)).toEqual(["nav.home"]);
    expect(await readJsonFile(join(cwd, "locales/en.json"))).toEqual({
      user: { "": "hand written" },
      nav: { home: "Home" },
    });
  });
});

describe("extract on a source file it cannot read to the end", () => {
  it("reports it as an unparseable diagnostic and still adds what it read", async () => {
    const cwd = await project({
      "src/nav.ts": 't("nav.home", "Home");\n/* never closed\nt("nav.lost");',
    });

    const result = await extract({ config: config(), cwd });

    expect(result.diagnostics).toEqual([{ file: "src/nav.ts", reason: "unparseable" }]);
    expect(result.added.map((entry) => entry.key)).toEqual(["nav.home"]);
  });
});

describe("extract on a regular expression inside a template substitution", () => {
  it.each([".ts", ".mts", ".cts", ".mjs", ".cjs", ".tsx", ".jsx", ".js"])(
    "adds the keys called around two such substitutions in a %s file",
    async (extension) => {
      const cwd = await project({
        [`src/csv${extension}`]: [
          "export function csv(v) {",
          '  return `"${v.replace(/"/g, \'""\')}"`;',
          "}",
          'export const label = () => t("home");',
          "export function csv2(v) {",
          '  return `"${v.replace(/"/g, \'""\')}"`;',
          "}",
          'export const other = () => t("zzz");',
          "",
        ].join("\n"),
      });

      const result = await extract({ config: config(), cwd, dryRun: true });

      expect(result.diagnostics).toEqual([]);
      expect(result.added.map((entry) => entry.key)).toEqual(["home", "zzz"]);
    },
  );
});

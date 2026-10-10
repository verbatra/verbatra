import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdapterRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { makeTempDir } from "../test-support.js";
import { detectProject } from "./detect-project.js";

const JSON_FORMATS = ["i18next-json", "vue-i18n-json", "next-intl-json", "ngx-translate-json"];

async function project(files: Readonly<Record<string, string>>): Promise<string> {
  const cwd = await makeTempDir();
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(cwd, relativePath);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return cwd;
}

function manifest(dependencies: Record<string, string>): string {
  return JSON.stringify({ dependencies });
}

const XCSTRINGS = JSON.stringify({
  sourceLanguage: "en",
  strings: {
    greeting: { localizations: { de: {}, "pt-BR": {}, bad_tag: {} } },
    farewell: "not an object",
  },
  version: "1.0",
});

describe("detectProject: formats decided by the files", () => {
  it.each([
    {
      name: "YAML files",
      files: { "config/locales/en.yml": "a: A\n", "config/locales/de.yml": "a: B\n" },
      format: "yaml",
      pattern: "config/locales/{locale}.yml",
      locales: ["de", "en"],
    },
    {
      name: "gettext catalogues in LC_MESSAGES directories",
      files: {
        "locale/de/LC_MESSAGES/app.po": 'msgid "a"\nmsgstr "b"\n',
        "locale/fr/LC_MESSAGES/app.po": 'msgid "a"\nmsgstr "c"\n',
        "locale/app.pot": 'msgid "a"\nmsgstr ""\n',
      },
      format: "gettext-po",
      pattern: "locale/{locale}/LC_MESSAGES/app.po",
      locales: ["de", "fr"],
    },
    {
      name: "Apple .lproj directories",
      files: {
        "ios/en.lproj/Localizable.strings": '"a" = "A";\n',
        "ios/de.lproj/Localizable.strings": '"a" = "B";\n',
      },
      format: "apple-strings",
      pattern: "ios/{locale}.lproj/Localizable.strings",
      locales: ["de", "en"],
    },
    {
      name: "Flutter ARB files with a prefix",
      files: { "lib/l10n/app_en.arb": '{"a":"A"}', "lib/l10n/app_de.arb": '{"a":"B"}' },
      format: "arb",
      pattern: "lib/l10n/app_{locale}.arb",
      locales: ["de", "en"],
    },
  ])("detects $name", async ({ files, format, pattern, locales }) => {
    const cwd = await project(files);
    const detection = await detectProject({ cwd });

    expect(detection.format).toEqual({ id: format, from: "files" });
    expect(detection.layout?.pattern).toBe(pattern);
    expect(detection.layout?.localeStyle).toBe("literal");
    expect(detection.layout?.locales).toEqual(locales);
    expect(detection.ambiguities).toEqual([]);
  });

  it("reports high confidence when the source locale is given and the files decide everything", async () => {
    const cwd = await project({ "i18n/en.yaml": "a: A\n", "i18n/de.yaml": "a: B\n" });
    const detection = await detectProject({ cwd, sourceLocale: "en" });

    expect(detection.confidence).toBe("high");
    expect(detection.layout?.sourceLocale).toBe("en");
    expect(detection.layout?.files).toEqual(["i18n/de.yaml", "i18n/en.yaml"]);
  });

  it("takes en as the source by convention at medium confidence", async () => {
    const cwd = await project({ "i18n/en.yaml": "a: A\n", "i18n/fr.yaml": "a: B\n" });
    const detection = await detectProject({ cwd });

    expect(detection.layout?.sourceLocale).toBe("en");
    expect(detection.confidence).toBe("medium");
    expect(detection.reasons).toContain("Took en as the source locale, by convention.");
  });

  it("takes the single en-* locale as the source when there is no plain en", async () => {
    const cwd = await project({ "i18n/en-US.yaml": "a: A\n", "i18n/fr.yaml": "a: B\n" });
    expect((await detectProject({ cwd })).layout?.sourceLocale).toBe("en-US");
  });

  it("leaves the source open when no locale is English", async () => {
    const cwd = await project({ "i18n/de.yaml": "a: A\n", "i18n/fr.yaml": "a: B\n" });
    const detection = await detectProject({ cwd });

    expect(detection.layout?.sourceLocale).toBeUndefined();
    expect(detection.reasons).toContain("Could not tell which locale is the source.");
    expect(detection.confidence).toBe("medium");
  });

  it("takes the only locale found as the source", async () => {
    const cwd = await project({ "locales/fr.yaml": "a: A\n" });
    const detection = await detectProject({ cwd });

    expect(detection.layout?.sourceLocale).toBe("fr");
    expect(detection.reasons).toContain("Only one locale file backs the pattern.");
  });
});

describe("detectProject: locale styles", () => {
  it("detects the posix style from underscore spellings", async () => {
    const cwd = await project({
      "src/main/resources/messages_en.properties": "a=A\n",
      "src/main/resources/messages_pt_BR.properties": "a=B\n",
    });
    const detection = await detectProject({ cwd });

    expect(detection.format?.id).toBe("properties");
    expect(detection.layout?.pattern).toBe("src/main/resources/messages_{locale}.properties");
    expect(detection.layout?.localeStyle).toBe("posix");
    expect(detection.layout?.locales).toEqual(["en", "pt-BR"]);
  });

  it("reads gettext script modifiers and numeric regions back to BCP 47 locales", async () => {
    const po = 'msgid "a"\nmsgstr "b"\n';
    const cwd = await project({
      "locale/en/LC_MESSAGES/app.po": po,
      "locale/sr@latin/LC_MESSAGES/app.po": po,
      "locale/uz@cyrillic/LC_MESSAGES/app.po": po,
      "locale/zh_TW/LC_MESSAGES/app.po": po,
      "locale/es_419/LC_MESSAGES/app.po": po,
    });
    const detection = await detectProject({ cwd });

    expect(detection.format?.id).toBe("gettext-po");
    expect(detection.layout?.pattern).toBe("locale/{locale}/LC_MESSAGES/app.po");
    expect(detection.layout?.localeStyle).toBe("posix");
    expect(detection.layout?.locales).toEqual(["en", "es-419", "sr-Latn", "uz-Cyrl", "zh-TW"]);
  });

  it("detects the android style and leaves the unqualified source locale open", async () => {
    const xml = '<resources><string name="a">A</string></resources>\n';
    const cwd = await project({
      "app/src/main/res/values/strings.xml": xml,
      "app/src/main/res/values-de/strings.xml": xml,
      "app/src/main/res/values-pt-rBR/strings.xml": xml,
      "app/src/main/res/values-b+sr+Latn/strings.xml": xml,
    });
    const detection = await detectProject({ cwd });

    expect(detection.format?.id).toBe("android-xml");
    expect(detection.layout?.pattern).toBe("app/src/main/res/{locale}/strings.xml");
    expect(detection.layout?.localeStyle).toBe("android");
    expect(detection.layout?.locales).toEqual(["de", "pt-BR", "sr-Latn"]);
    expect(detection.layout?.sourceLocale).toBeUndefined();
    expect(detection.reasons).toContain(
      "The unqualified values directory holds the source locale but names none.",
    );
    expect(detection.confidence).toBe("medium");
  });

  it("leaves the android source open even when a regional English folder exists", async () => {
    const xml = '<resources><string name="a">A</string></resources>\n';
    const cwd = await project({
      "res/values/strings.xml": xml,
      "res/values-en-rGB/strings.xml": xml,
      "res/values-de/strings.xml": xml,
    });
    const detection = await detectProject({ cwd });

    expect(detection.layout?.sourceLocale).toBeUndefined();
    expect(detection.layout?.locales).toEqual(["de", "en-GB"]);
  });

  it("uses a given source locale for an android layout", async () => {
    const xml = '<resources><string name="a">A</string></resources>\n';
    const cwd = await project({
      "res/values/strings.xml": xml,
      "res/values-de/strings.xml": xml,
    });
    const detection = await detectProject({ cwd, sourceLocale: "en" });
    expect(detection.layout?.sourceLocale).toBe("en");
    expect(detection.confidence).toBe("high");
  });

  it("drops a layout that mixes underscore and hyphen spellings", async () => {
    const cwd = await project({
      "locales/pt_BR.yaml": "a: A\n",
      "locales/pt-PT.yaml": "a: B\n",
    });
    const detection = await detectProject({ cwd });

    expect(detection.layout).toBeUndefined();
    expect(detection.reasons).toContain("No locale file was found.");
  });
});

describe("detectProject: an unqualified source file", () => {
  it.each([
    {
      name: "a Java base bundle",
      files: {
        "src/main/resources/messages.properties": "a=A\n",
        "src/main/resources/messages_de.properties": "a=B\n",
        "src/main/resources/messages_fr.properties": "a=C\n",
      },
      base: "src/main/resources/messages.properties",
      pattern: "src/main/resources/messages_{locale}.properties",
    },
    {
      name: "a .NET neutral resource file",
      files: {
        "Resources/Strings.resx": "<root/>",
        "Resources/Strings.de.resx": "<root/>",
        "Resources/Strings.en.resx": "<root/>",
      },
      base: "Resources/Strings.resx",
      pattern: "Resources/Strings.{locale}.resx",
    },
    {
      name: "a gettext template",
      files: {
        "po/app.pot": 'msgid "a"\nmsgstr ""\n',
        "locale/de/LC_MESSAGES/app.po": 'msgid "a"\nmsgstr "b"\n',
        "locale/en/LC_MESSAGES/app.po": 'msgid "a"\nmsgstr "a"\n',
      },
      base: "po/app.pot",
      pattern: "locale/{locale}/LC_MESSAGES/app.po",
    },
  ])(
    "names $name and leaves the source open at medium confidence",
    async ({ files, base, pattern }) => {
      const cwd = await project(files);
      const detection = await detectProject({ cwd });

      expect(detection.layout?.pattern).toBe(pattern);
      expect(detection.layout?.unqualifiedSourceFile).toBe(base);
      expect(detection.layout?.sourceLocale).toBeUndefined();
      expect(detection.confidence).toBe("medium");
      expect(detection.reasons.some((reason) => reason.startsWith(`${base} holds strings`))).toBe(
        true,
      );
    },
  );

  it("keeps a given source locale next to an unqualified file", async () => {
    const cwd = await project({
      "i18n/messages.properties": "a=A\n",
      "i18n/messages_de.properties": "a=B\n",
    });
    const detection = await detectProject({ cwd, sourceLocale: "en" });

    expect(detection.layout?.sourceLocale).toBe("en");
    expect(detection.confidence).toBe("medium");
  });

  it("reports no unqualified file when none exists", async () => {
    const cwd = await project({ "i18n/app_en.arb": "{}", "i18n/app_de.arb": "{}" });
    expect((await detectProject({ cwd })).layout?.unqualifiedSourceFile).toBeUndefined();
  });
});

describe("detectProject: shared catalogues", () => {
  it("reads the locales and the source language from an .xcstrings catalogue", async () => {
    const cwd = await project({ "App/Localizable.xcstrings": XCSTRINGS });
    const detection = await detectProject({ cwd });

    expect(detection.format).toEqual({ id: "apple-xcstrings", from: "files" });
    expect(detection.layout?.pattern).toBe("App/{locale}Localizable.xcstrings");
    expect(detection.layout?.locales).toEqual(["de", "en", "pt-BR"]);
    expect(detection.layout?.sourceLocale).toBe("en");
  });

  it("matches a given shared-catalogue pattern", async () => {
    const cwd = await project({ "Localizable.xcstrings": XCSTRINGS });
    const detection = await detectProject({
      cwd,
      format: "apple-xcstrings",
      pattern: "{locale}Localizable.xcstrings",
    });

    expect(detection.layout?.files).toEqual(["Localizable.xcstrings"]);
    expect(detection.layout?.sourceLocale).toBe("en");
  });

  it("reports no locale for a catalogue that is not JSON", async () => {
    const cwd = await project({ "Localizable.xcstrings": "not json" });
    const detection = await detectProject({ cwd });

    expect(detection.layout?.locales).toEqual([]);
    expect(detection.layout?.sourceLocale).toBeUndefined();
  });
});

describe("detectProject: JSON and package.json", () => {
  it("breaks the JSON tie with a single i18n dependency", async () => {
    const cwd = await project({
      "package.json": manifest({ "vue-i18n": "^9" }),
      "src/locales/en.json": '{"a":"A"}',
      "src/locales/de.json": '{"a":"B"}',
    });
    const detection = await detectProject({ cwd });

    expect(detection.format).toEqual({ id: "vue-i18n-json", from: "dependencies" });
    expect(detection.layout?.pattern).toBe("src/locales/{locale}.json");
    expect(detection.confidence).toBe("medium");
    expect(detection.reasons).toContain(
      "Chose vue-i18n-json because package.json depends on vue-i18n.",
    );
  });

  it("reports a format ambiguity for plain JSON with no i18n dependency", async () => {
    const cwd = await project({ "locales/en.json": '{"a":"A"}', "locales/de.json": '{"a":"B"}' });
    const detection = await detectProject({ cwd });

    expect(detection.format).toBeUndefined();
    expect(detection.ambiguities).toEqual([{ subject: "format", candidates: JSON_FORMATS }]);
    expect(detection.layout?.pattern).toBe("locales/{locale}.json");
  });

  it("falls back to the dependencies when no single adapter reads every file", async () => {
    const cwd = await project({
      "package.json": manifest({ i18next: "^23" }),
      "locales/en.json": "[1, 2]",
      "locales/de.json": "[3]",
    });
    const detection = await detectProject({ cwd });

    expect(detection.reasons).toContain("No single adapter reads every locale file found.");
    expect(detection.format).toEqual({ id: "i18next-json", from: "dependencies" });
  });

  it("detects the format from a single dependency at low confidence when no file exists", async () => {
    const cwd = await project({
      "package.json": JSON.stringify({ devDependencies: { "next-intl": "^3" } }),
    });
    const detection = await detectProject({ cwd });

    expect(detection.format).toEqual({ id: "next-intl-json", from: "dependencies" });
    expect(detection.layout).toBeUndefined();
    expect(detection.confidence).toBe("low");
    expect(detection.reasons).toContain("No locale file was found.");
  });

  it("reports a format ambiguity when several i18n dependencies match and no file exists", async () => {
    const cwd = await project({ "package.json": manifest({ i18next: "^23", "vue-i18n": "^9" }) });
    const detection = await detectProject({ cwd });

    expect(detection.format).toBeUndefined();
    expect(detection.ambiguities).toEqual([
      { subject: "format", candidates: ["i18next-json", "vue-i18n-json"] },
    ]);
    expect(detection.confidence).toBe("none");
  });

  it.each(["{ not json", "null", JSON.stringify({ dependencies: ["i18next"] })])(
    "ignores an unusable package.json: %s",
    async (content) => {
      const cwd = await project({ "package.json": content });
      const detection = await detectProject({ cwd });

      expect(detection.format).toBeUndefined();
      expect(detection.confidence).toBe("none");
    },
  );
});

describe("detectProject: layouts", () => {
  it("reports a layout ambiguity for namespace files per locale", async () => {
    const cwd = await project({
      "locales/en/common.yaml": "a: A\n",
      "locales/de/common.yaml": "a: B\n",
      "locales/en/auth.yaml": "a: A\n",
      "locales/de/auth.yaml": "a: B\n",
    });
    const detection = await detectProject({ cwd });

    expect(detection.layout).toBeUndefined();
    expect(detection.ambiguities).toEqual([
      {
        subject: "layout",
        candidates: ["locales/{locale}/auth.yaml", "locales/{locale}/common.yaml"],
      },
    ]);
  });

  it("keeps lowercase regions as written instead of splitting them off", async () => {
    const cwd = await project({
      "locales/en.json": '{"a":"A"}',
      "locales/de.json": '{"a":"B"}',
      "locales/pt-br.json": '{"a":"C"}',
      "locales/zh-tw.json": '{"a":"D"}',
    });
    const detection = await detectProject({ cwd, format: "i18next-json" });

    expect(detection.layout?.pattern).toBe("locales/{locale}.json");
    expect(detection.layout?.locales).toEqual(["de", "en", "pt-br", "zh-tw"]);
  });

  it("does not read the region of a lone regional file name as a language", async () => {
    const cwd = await project({ "locales/en-us.json": "{}", "locales/fr-ca.json": "{}" });
    const detection = await detectProject({ cwd, format: "i18next-json" });

    expect(detection.layout?.pattern).toBe("locales/{locale}.json");
    expect(detection.layout?.locales).toEqual(["en-us", "fr-ca"]);
  });

  it("reports unrelated directories with as many locales as a layout ambiguity", async () => {
    const cwd = await project({
      "locales/en.yaml": "a: A\n",
      "locales/de.yaml": "a: B\n",
      "apps/web/i18n/en.yaml": "a: A\n",
      "apps/web/i18n/fr.yaml": "a: B\n",
    });
    const detection = await detectProject({ cwd });

    expect(detection.layout).toBeUndefined();
    expect(detection.ambiguities).toEqual([
      { subject: "layout", candidates: ["apps/web/i18n/{locale}.yaml", "locales/{locale}.yaml"] },
    ]);
    expect(detection.confidence).toBe("none");
  });

  it("does not add a missing-file doubt when the layout is ambiguous", async () => {
    const cwd = await project({
      "package.json": manifest({ i18next: "^23" }),
      "locales/en/common.json": "{}",
      "locales/de/common.json": "{}",
      "locales/en/auth.json": "{}",
      "locales/de/auth.json": "{}",
    });
    const detection = await detectProject({ cwd });

    expect(detection.format).toEqual({ id: "i18next-json", from: "dependencies" });
    expect(detection.reasons).not.toContain("No locale file backs the format.");
    expect(detection.confidence).toBe("medium");
  });

  it("requires a locale hint when every spelling is a three-letter code", async () => {
    const cwd = await project({
      "src/app.yaml": "a: A\n",
      "bin/app.yaml": "a: B\n",
      "ast/app.yaml": "a: C\n",
    });
    expect((await detectProject({ cwd })).layout).toBeUndefined();
  });

  it("accepts a three-letter locale when the path before it names a locale directory", async () => {
    const cwd = await project({ "i18n/fil.yaml": "a: A\n", "src/ast/app.yaml": "a: B\n" });
    expect((await detectProject({ cwd })).layout?.pattern).toBe("i18n/{locale}.yaml");
  });

  it("notes symbolic links it did not follow", async () => {
    const cwd = await project({
      "real/locales/en.yaml": "a: A\n",
      "real/locales/de.yaml": "a: B\n",
    });
    await symlink(join(cwd, "real"), join(cwd, "linked"));
    const detection = await detectProject({ cwd });

    expect(detection.layout?.pattern).toBe("real/locales/{locale}.yaml");
    expect(detection.reasons).toContain(
      "Skipped 1 entry that is neither a file nor a directory, such as a symbolic link; nothing behind a symbolic link was scanned.",
    );
  });

  it("prefers the deepest token among patterns over the same files", async () => {
    const cwd = await project({ "src/locales/en.yaml": "a: A\n" });
    expect((await detectProject({ cwd })).layout?.pattern).toBe("src/locales/{locale}.yaml");
  });

  it("lowers the confidence when an ambiguity stays open", async () => {
    const cwd = await project({ "locales/en.json": "{}", "locales/de.json": "{}" });
    const detection = await detectProject({ cwd, sourceLocale: "en" });

    expect(detection.ambiguities).toHaveLength(1);
    expect(detection.confidence).toBe("medium");
  });

  it("prefers the pattern covering the most locales and the deepest token", async () => {
    const cwd = await project({
      "src/locales/en.yaml": "a: A\n",
      "src/locales/de.yaml": "a: B\n",
      "src/locales/fr.yaml": "a: C\n",
    });
    expect((await detectProject({ cwd })).layout?.pattern).toBe("src/locales/{locale}.yaml");
  });

  it("does not mistake an unrelated source directory for a locale", async () => {
    const cwd = await project({ "src/components/button.yaml": "a: A\n" });
    const detection = await detectProject({ cwd });

    expect(detection.layout).toBeUndefined();
    expect(detection.confidence).toBe("none");
  });

  it("skips hidden directories and dependency folders", async () => {
    const cwd = await project({
      "node_modules/pkg/locales/en.yaml": "a: A\n",
      ".cache/locales/de.yaml": "a: A\n",
    });
    expect((await detectProject({ cwd })).layout).toBeUndefined();
  });

  it("matches a given pattern and reports none when nothing matches it", async () => {
    const cwd = await project({ "i18n/en.yaml": "a: A\n", "i18n/de.yaml": "a: B\n" });

    const matched = await detectProject({ cwd, pattern: "./i18n/{locale}.yaml" });
    expect(matched.layout?.pattern).toBe("i18n/{locale}.yaml");
    expect(matched.layout?.locales).toEqual(["de", "en"]);

    const unmatched = await detectProject({ cwd, pattern: "translations/{locale}.yaml" });
    expect(unmatched.layout).toBeUndefined();
    expect(unmatched.reasons).toContain(
      "No locale file matches the pattern translations/{locale}.yaml.",
    );
  });

  it("ignores files whose captured spelling is not a locale under a given pattern", async () => {
    const cwd = await project({ "i18n/en.yaml": "a: A\n", "i18n/nonsense.yaml": "a: B\n" });
    const detection = await detectProject({ cwd, pattern: "i18n/{locale}.yaml" });
    expect(detection.layout?.files).toEqual(["i18n/en.yaml"]);
  });

  it("reports inconsistent spellings under a given pattern", async () => {
    const cwd = await project({ "i18n/pt_BR.yaml": "a: A\n", "i18n/pt-PT.yaml": "a: B\n" });
    const detection = await detectProject({ cwd, pattern: "i18n/{locale}.yaml" });

    expect(detection.layout).toBeUndefined();
    expect(detection.reasons).toContain(
      "The files matching i18n/{locale}.yaml spell their locales in more than one way.",
    );
  });

  it("repeats the locale when a given pattern names the token twice", async () => {
    const cwd = await project({ "i18n/de/de.yaml": "a: A\n", "i18n/en/fr.yaml": "a: B\n" });
    const detection = await detectProject({ cwd, pattern: "i18n/{locale}/{locale}.yaml" });
    expect(detection.layout?.files).toEqual(["i18n/de/de.yaml"]);
  });

  it("considers only files the given format claims", async () => {
    const cwd = await project({
      "i18n/en.yaml": "a: A\n",
      "i18n/de.yaml": "a: B\n",
      "i18n/en.json": '{"a":"A"}',
      "i18n/de.json": '{"a":"B"}',
      "i18n/fr.json": '{"a":"C"}',
    });
    const detection = await detectProject({ cwd, format: "yaml" });

    expect(detection.format).toEqual({ id: "yaml", from: "input" });
    expect(detection.layout?.pattern).toBe("i18n/{locale}.yaml");
  });

  it("reports confidence none when only the given format is known", async () => {
    const cwd = await project({});
    const detection = await detectProject({ cwd, format: "yaml" });

    expect(detection.format).toEqual({ id: "yaml", from: "input" });
    expect(detection.confidence).toBe("none");
  });
});

describe("detectProject: bounded and defensive scanning", () => {
  it("reports a truncated scan when locale files sit deeper than the depth bound", async () => {
    const deep = "a/b/c/d/e/f/g/h/i/j";
    const cwd = await project({
      "locales/en.yaml": "a: A\n",
      "locales/de.yaml": "a: B\n",
      [`${deep}/locales/fr.yaml`]: "a: C\n",
    });
    const detection = await detectProject({ cwd });

    expect(detection.confidence).toBe("medium");
    expect(detection.reasons.some((reason) => reason.startsWith("The scan stopped at"))).toBe(true);
  });

  it("falls back to package.json when the file system cannot list directories", async () => {
    const cwd = await project({ "package.json": manifest({ i18next: "^23" }) });
    const { readDirectory: _omitted, ...withoutListing } = defaultFs;
    const detection = await detectProject({ cwd }, { fs: withoutListing });

    expect(detection.format).toEqual({ id: "i18next-json", from: "dependencies" });
    expect(detection.confidence).toBe("low");
    expect(detection.reasons[0]).toBe(
      "The file system lists no directories, so no locale file was looked for.",
    );
  });

  it("survives a directory listing or a file read that throws", async () => {
    const cwd = await project({ "locales/en.yaml": "a: A\n", "locales/de.yaml": "a: B\n" });
    const failing: SdkFs = {
      ...defaultFs,
      readDirectory: async (path) => {
        if (path.endsWith("locales")) {
          throw new Error("EACCES");
        }
        return defaultFs.readDirectory?.(path) ?? [];
      },
      readFileBounded: async () => {
        throw new Error("EIO");
      },
    };
    const detection = await detectProject({ cwd }, { fs: failing });
    expect(detection.layout).toBeUndefined();
  });

  it("survives a third-party adapter whose detection throws", async () => {
    const throwing: FormatAdapter = {
      format: "custom:broken",
      canHandle: () => {
        throw new Error("boom");
      },
      read: async () => {
        throw new Error("unused");
      },
      write: async () => {},
      extractPlaceholders: () => [],
      validateMessage: () => true,
    };
    const registry = new AdapterRegistry().register(throwing);
    const cwd = await project({ "locales/en.yaml": "a: A\n", "locales/de.yaml": "a: B\n" });

    const scanned = await detectProject({ cwd }, { adapterRegistry: registry });
    expect(scanned.layout).toBeUndefined();

    const given = await detectProject(
      { cwd, format: "custom:broken", pattern: "locales/{locale}.yaml" },
      { adapterRegistry: registry },
    );
    expect(given.layout).toBeUndefined();
  });

  it("defaults the directory to the process working directory", async () => {
    const detection = await detectProject({ pattern: "no-such-dir-for-verbatra/{locale}.yaml" });
    expect(detection.layout).toBeUndefined();
  });
});

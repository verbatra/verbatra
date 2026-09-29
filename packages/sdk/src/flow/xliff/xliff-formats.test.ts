import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../../config/schema.js";
import { createLocalePathResolver } from "../../locale-path/resolver.js";
import {
  baseConfig,
  editXliffUnit,
  makeStubProvider,
  makeTempDir,
  xliffSourceInner,
} from "../../test-support.js";
import { translate } from "../translate-project.js";
import type { XliffFormat } from "../workbook/exchange-format.js";
import { exportWorkbook } from "../workbook/export-workbook.js";
import { importWorkbook } from "../workbook/import-workbook.js";

interface ProjectFormat {
  readonly name: string;
  readonly config: Partial<VerbatraConfig>;
  readonly source: (values: Readonly<Record<string, string>>) => string;
  readonly written: (value: string) => string;
}

function androidEscape(value: string): string {
  return value.replaceAll("'", "\\'");
}

const PROJECT_FORMATS: readonly ProjectFormat[] = [
  {
    name: "i18next-json",
    config: { format: "i18next-json", files: { pattern: "locales/{locale}.json" } },
    source: (values) => `${JSON.stringify(values, null, 2)}\n`,
    written: (value) => JSON.stringify(value),
  },
  {
    name: "android-xml",
    config: {
      format: "android-xml",
      files: { pattern: "res/{locale}/strings.xml", localeStyle: "android" },
    },
    source: (values) =>
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<resources>",
        ...Object.entries(values).map(
          ([key, value]) => `    <string name="${key}">${androidEscape(value)}</string>`,
        ),
        "</resources>",
        "",
      ].join("\n"),
    written: (value) => `>${androidEscape(value)}<`,
  },
  {
    name: "gettext-po",
    config: { format: "gettext-po", files: { pattern: "locales/{locale}.po" } },
    source: (values) =>
      [
        'msgid ""',
        'msgstr "Content-Type: text/plain; charset=UTF-8\\n"',
        "",
        ...Object.entries(values).flatMap(([key, value]) => [
          `msgid "${key}"`,
          `msgstr "${value}"`,
          "",
        ]),
      ].join("\n"),
    written: (value) => `"${value}"`,
  },
];

const XLIFF_FORMATS: readonly XliffFormat[] = ["xliff2", "xliff12"];

const SOURCE = {
  greeting: "Hello %1$s, welcome",
  farewell: "Goodbye %s",
  title: "Settings",
  count: "%d files",
};

const CASES = PROJECT_FORMATS.flatMap((project) =>
  XLIFF_FORMATS.map((xliff) => [project.name, xliff, project] as const),
);

describe.each(CASES)("XLIFF round trip over %s (%s)", (_name, xliff, format) => {
  it("imports the edited units, keeps every other key byte-stable, and placeholders intact", async () => {
    const dir = await makeTempDir();
    const config = baseConfig({ targetLocales: ["de"], ...format.config });
    const resolver = createLocalePathResolver(dir, config);
    const sourcePath = resolver.pathFor("en");
    const targetPath = resolver.pathFor("de");
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, format.source(SOURCE), "utf8");
    await translate(
      { config, cwd: dir },
      { createProvider: (provider) => makeStubProvider({ id: provider.id }).provider },
    );
    await writeFile(
      sourcePath,
      format.source({ ...SOURCE, greeting: "Hi %1$s, welcome back" }),
      "utf8",
    );
    const before = await readFile(targetPath, "utf8");

    await exportWorkbook({ config, cwd: dir, format: xliff, out: "handoff" });
    const handoff = join(dir, "handoff", "de.xlf");
    const xml = await readFile(handoff, "utf8");
    const greeting = xliffSourceInner(xml, "greeting").replace("Hi ", "Hallo ");
    await writeFile(
      handoff,
      editXliffUnit(xml, "greeting", { target: greeting, state: "translated" }),
      "utf8",
    );

    const summary = await importWorkbook({ config, cwd: dir, workbook: "handoff", format: xliff });

    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
    expect(summary.locales[0]?.integrityRefusals).toEqual([]);
    const after = await readFile(targetPath, "utf8");
    expect(after).toBe(
      before.replace(
        format.written("[de] Hello %1$s, welcome"),
        format.written("Hallo %1$s, welcome back"),
      ),
    );
  });
});

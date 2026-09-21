import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { LocaleResource, SupportedFormat, TranslationEntry } from "@verbatra/core";
import { SUPPORTED_FORMATS } from "@verbatra/core";
import { createDefaultRegistry } from "@verbatra/format-adapters";
import { beforeAll, describe, expect, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { generateTypes } from "./generate-types.js";

const run = promisify(execFile);

const TSC = join(dirname(dirname(import.meta.dirname)), "node_modules", ".bin", "tsc");

const CONTROL = "__control__";

interface FormatFixture {
  readonly pattern: string;
  readonly plainKey: string;
  readonly argumentKey: string;
  readonly values: readonly (readonly [string, string])[];
  readonly literal?: string;
}

const XLIFF_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext"><body>
<trans-unit id="title"><source>Verbatra</source></trans-unit>
<trans-unit id="greeting"><source>Hello {name}</source></trans-unit>
</body></file></xliff>
`;

const XCSTRINGS_SOURCE = `${JSON.stringify(
  {
    sourceLanguage: "en",
    version: "1.0",
    strings: {
      title: { localizations: { en: { stringUnit: { state: "translated", value: "Verbatra" } } } },
      greeting: {
        localizations: {
          en: { stringUnit: { state: "translated", value: "Hello %@ you have %lld" } },
        },
      },
    },
  },
  null,
  2,
)}\n`;

const FIXTURES: Record<SupportedFormat, FormatFixture> = {
  "i18next-json": {
    pattern: "locales/{locale}.json",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello {{name}}"],
    ],
  },
  "vue-i18n-json": {
    pattern: "locales/{locale}.json",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello {name}"],
    ],
  },
  "next-intl-json": {
    pattern: "messages/{locale}.json",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello {name}"],
      ["cart", "{count, plural, one {# item} other {# items}}"],
    ],
  },
  "ngx-translate-json": {
    pattern: "locales/{locale}.json",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello {{name}}"],
    ],
  },
  xliff: {
    pattern: "locales/{locale}.xlf",
    plainKey: "title",
    argumentKey: "greeting",
    values: [],
    literal: XLIFF_SOURCE,
  },
  yaml: {
    pattern: "locales/{locale}.yaml",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello {{name}}"],
    ],
  },
  arb: {
    pattern: "locales/app_{locale}.arb",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello {name}"],
    ],
  },
  properties: {
    pattern: "locales/messages_{locale}.properties",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello {0}"],
    ],
  },
  "apple-strings": {
    pattern: "locales/{locale}.lproj/Localizable.strings",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello %@ you have %d"],
    ],
  },
  "apple-xcstrings": {
    pattern: "locales/Localizable{locale}.xcstrings",
    plainKey: "title",
    argumentKey: "greeting",
    values: [],
    literal: XCSTRINGS_SOURCE,
  },
  "android-xml": {
    pattern: "res/values-{locale}/strings.xml",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello %1$s you have %2$d"],
    ],
  },
  "gettext-po": {
    pattern: "locales/{locale}.po",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello %(name)s"],
    ],
  },
  ini: {
    pattern: "locales/{locale}.ini",
    plainKey: "section.title",
    argumentKey: "section.greeting",
    values: [
      ["section.title", "Verbatra"],
      ["section.greeting", "Hello {name}"],
    ],
  },
  resx: {
    pattern: "locales/Messages.{locale}.resx",
    plainKey: "title",
    argumentKey: "greeting",
    values: [
      ["title", "Verbatra"],
      ["greeting", "Hello {0}"],
    ],
  },
};

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    noEmit: true,
    skipLibCheck: false,
    types: [],
  },
  files: [...SUPPORTED_FORMATS.map((format) => `${format}/usage.ts`), `${CONTROL}/usage.ts`],
};

const PRELUDE = `import type {
  VerbatraMessageArguments,
  VerbatraMessageKey,
  VerbatraMessages,
  VerbatraPluralMessageKey,
} from "./verbatra-types.js";

declare function t<Key extends VerbatraMessageKey>(
  key: Key,
  args: VerbatraMessageArguments<Key>,
): string;

type NotNever<T> = [T] extends [never] ? never : true;
type NotString<T> = string extends T ? never : true;
`;

function usageFor(fixture: FormatFixture): string {
  return `${PRELUDE}
export const declaresAtLeastOneKey: NotNever<VerbatraMessageKey> = true;
export const keysAreLiteralsNotAnyString: NotString<VerbatraMessageKey> = true;

t(${JSON.stringify(fixture.plainKey)}, {});
// @ts-expect-error a message the catalog records as taking nothing must reject an argument
t(${JSON.stringify(fixture.plainKey)}, { surprise: 1 });

// @ts-expect-error a key the catalog does not carry is not a key
t("verbatra.no.such.key", {});

export type Plain = VerbatraMessages[${JSON.stringify(fixture.plainKey)}];
export type WithArguments = VerbatraMessages[${JSON.stringify(fixture.argumentKey)}];
export type Plural = VerbatraPluralMessageKey;
`;
}

const CONTROL_USAGE = `${PRELUDE}
t("verbatra.no.such.key", {});
`;

function entry(key: string, value: string, placeholders: readonly string[]): TranslationEntry {
  return { key, namespace: "", value, placeholders, isPlural: false };
}

async function seedCatalog(dir: string, format: SupportedFormat): Promise<void> {
  const fixture = FIXTURES[format];
  const resolution = createDefaultRegistry().resolve(`catalog.${format}`, { format });
  if (resolution.status !== "resolved") {
    throw new Error(`no adapter registered for ${format}`);
  }
  const relative = fixture.pattern.replace("{locale}", format === "apple-xcstrings" ? "" : "en");
  const path = join(dir, relative);
  await mkdir(dirname(path), { recursive: true });
  if (fixture.literal !== undefined) {
    await writeFile(path, fixture.literal, "utf8");
    return;
  }
  const entries = new Map<string, TranslationEntry>();
  for (const [key, value] of fixture.values) {
    entries.set(key, entry(key, value, resolution.adapter.extractPlaceholders(value)));
  }
  const resource: LocaleResource = { locale: "en", namespace: "", format, entries };
  await resolution.adapter.write(resource, path);
}

function membersOf(declaration: string): readonly string[] {
  const body = /export interface VerbatraMessages \{\n([\s\S]*?)\n\}/.exec(declaration);
  return body?.[1] === undefined ? [] : body[1].split("\n");
}

interface FormatOutcome {
  readonly keys: number;
  readonly withArguments: number;
  readonly members: readonly string[];
  readonly declaration: string;
}

const outcomes = new Map<SupportedFormat, FormatOutcome>();
let tscOutput = "";

beforeAll(async () => {
  const project = await makeTempDir();
  for (const format of SUPPORTED_FORMATS) {
    const fixture = FIXTURES[format];
    const dir = await makeTempDir();
    await seedCatalog(dir, format);
    const result = await generateTypes({
      config: baseConfig({ format, files: { pattern: fixture.pattern } }),
      cwd: dir,
    });
    const declaration = await readFile(result.path, "utf8");
    outcomes.set(format, {
      keys: result.keys,
      withArguments: result.withArguments,
      members: membersOf(declaration),
      declaration,
    });
    await mkdir(join(project, format), { recursive: true });
    await writeFile(join(project, format, "verbatra-types.d.ts"), declaration, "utf8");
    await writeFile(join(project, format, "usage.ts"), usageFor(fixture), "utf8");
  }

  await mkdir(join(project, CONTROL), { recursive: true });
  await writeFile(
    join(project, CONTROL, "verbatra-types.d.ts"),
    outcomes.get("i18next-json")?.declaration ?? "",
    "utf8",
  );
  await writeFile(join(project, CONTROL, "usage.ts"), CONTROL_USAGE, "utf8");
  await writeFile(join(project, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2), "utf8");

  try {
    tscOutput = (await run(TSC, ["-p", project], { cwd: project })).stdout;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    tscOutput = `${failure.stdout ?? ""}${failure.stderr ?? ""}` || String(error);
  }
}, 300_000);

function diagnosticsFor(prefix: string): readonly string[] {
  return tscOutput
    .split("\n")
    .filter((line) => line.startsWith(`${prefix}/`) || line.includes(`/${prefix}/`));
}

describe("every shipped format produces a declaration a consumer can compile against", () => {
  it("covers every member of SUPPORTED_FORMATS, so no format can be silently skipped", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...SUPPORTED_FORMATS].sort());
    expect(SUPPORTED_FORMATS).toHaveLength(14);
    expect(outcomes.size).toBe(SUPPORTED_FORMATS.length);
  });

  it("really ran tsc: the control usage, which must not compile, is reported", () => {
    expect(diagnosticsFor(CONTROL).join("\n")).toContain("verbatra.no.such.key");
  });

  it.each(SUPPORTED_FORMATS)("compiles the %s declaration under strict TypeScript", (format) => {
    expect(diagnosticsFor(format)).toEqual([]);
  });

  it.each(SUPPORTED_FORMATS)("declares every key the %s catalog carried", (format) => {
    const outcome = outcomes.get(format);
    expect(outcome).toBeDefined();
    expect(outcome?.keys).toBeGreaterThanOrEqual(2);
    expect(outcome?.members).toHaveLength(outcome?.keys ?? -1);
  });

  it.each(SUPPORTED_FORMATS)("says something about the %s catalog's arguments", (format) => {
    const outcome = outcomes.get(format);
    const members = outcome?.members ?? [];

    expect(outcome?.withArguments).toBeGreaterThanOrEqual(1);
    expect(members.some((member) => member.includes("VerbatraNoArguments"))).toBe(true);
    expect(
      members.some((member) => /: \{ readonly | : readonly \[|: readonly \[/.test(member)),
    ).toBe(true);
    expect(members.every((member) => member.includes("VerbatraUnknownArguments"))).toBe(false);
  });

  it.each(SUPPORTED_FORMATS)("names %s as the format it read", (format) => {
    expect(outcomes.get(format)?.declaration).toContain(`(${format}). Do not edit by hand.`);
  });
});

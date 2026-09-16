import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { FormatId } from "@verbatra/core";
import { beforeAll, describe, expect, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { generateTypes } from "./generate-types.js";

const run = promisify(execFile);

const TSC = join(dirname(dirname(import.meta.dirname)), "node_modules", ".bin", "tsc");

interface Scenario {
  readonly name: string;
  readonly format: FormatId;
  readonly pattern: string;
  readonly catalogPath: string;
  readonly catalog: string;
  readonly usage: string;
}

function json(value: Record<string, string>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function nextIntl(name: string, messages: Record<string, string>, usage: string): Scenario {
  return {
    name,
    format: "next-intl-json",
    pattern: "messages/{locale}.json",
    catalogPath: "messages/en.json",
    catalog: json(messages),
    usage,
  };
}

function arb(name: string, messages: Record<string, string>, usage: string): Scenario {
  return {
    name,
    format: "arb",
    pattern: "l10n/app_{locale}.arb",
    catalogPath: "l10n/app_en.arb",
    catalog: json({ "@@locale": "en", ...messages }),
    usage,
  };
}

const INVITE = "{gender, select, female {{name} invited you} other {Someone invited you}}";

const INVITE_USAGE = `
t("invite", { gender: "female", name: "Ada" });
t("invite", { gender: "other" });
// @ts-expect-error the select argument is required on every path
t("invite", { name: "Ada" });
// @ts-expect-error an argument no branch uses is still rejected
t("invite", { gender: "female", nickname: "Ada" });
`;

const SCENARIOS: readonly Scenario[] = [
  nextIntl("next-intl-branch-only", { invite: INVITE }, INVITE_USAGE),
  arb("arb-branch-only", { invite: INVITE }, INVITE_USAGE),
  nextIntl(
    "plural-other-only",
    { items: "{count, plural, one {One item} other {{total} items}}" },
    `
t("items", { count: 1 });
t("items", { count: 2, total: 2 });
// @ts-expect-error the plural argument itself is required
t("items", { total: 2 });
`,
  ),
  nextIntl(
    "nested-branches",
    {
      nested: "{a, select, x {{b, plural, one {{c}} other {{c} {d}}}} other {{c}}}",
    },
    `
t("nested", { a: "x", b: 1, c: "c", d: "d" });
t("nested", { a: "y", c: "c" });
// @ts-expect-error an argument every path reaches is required
t("nested", { a: "y" });
`,
  ),
];

const CONTROL = "__control__";

const PRELUDE = `import type { VerbatraMessageArguments, VerbatraMessageKey } from "./verbatra-types.js";

declare function t<Key extends VerbatraMessageKey>(
  key: Key,
  args: VerbatraMessageArguments<Key>,
): string;
`;

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
  files: [...SCENARIOS.map((scenario) => `${scenario.name}/usage.ts`), `${CONTROL}/usage.ts`],
};

const declarations = new Map<string, string>();
let tscOutput = "";

async function generateInto(project: string, scenario: Scenario): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(dirname(join(dir, scenario.catalogPath)), { recursive: true });
  await writeFile(join(dir, scenario.catalogPath), scenario.catalog, "utf8");
  const result = await generateTypes({
    config: baseConfig({ format: scenario.format, files: { pattern: scenario.pattern } }),
    cwd: dir,
  });
  const declaration = await readFile(result.path, "utf8");
  await mkdir(join(project, scenario.name), { recursive: true });
  await writeFile(join(project, scenario.name, "verbatra-types.d.ts"), declaration, "utf8");
  await writeFile(join(project, scenario.name, "usage.ts"), `${PRELUDE}${scenario.usage}`, "utf8");
  return declaration;
}

beforeAll(async () => {
  const project = await makeTempDir();
  for (const scenario of SCENARIOS) {
    declarations.set(scenario.name, await generateInto(project, scenario));
  }
  await generateInto(project, {
    ...nextIntl("", { invite: INVITE }, '\nt("invite", { gender: "female", nickname: 1 });\n'),
    name: CONTROL,
  });
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

describe("the declared argument shapes hold up at a real call site", () => {
  it("really ran tsc: the control usage, which must not compile, is reported", () => {
    expect(diagnosticsFor(CONTROL).join("\n")).toContain("nickname");
  });

  it.each(SCENARIOS.map((scenario) => scenario.name))(
    "accepts every valid call and rejects every wrong one in %s",
    (name) => {
      expect({
        name,
        diagnostics: diagnosticsFor(name),
        declaration: declarations.get(name),
      }).toMatchObject({ diagnostics: [] });
    },
  );
});

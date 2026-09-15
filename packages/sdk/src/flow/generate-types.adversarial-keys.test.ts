import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { generateTypes } from "./generate-types.js";

const run = promisify(execFile);

const TSC = join(dirname(dirname(import.meta.dirname)), "node_modules", ".bin", "tsc");

const NEWLINE_KEY = "line\nbreak";
const WHITESPACE_KEY = "   ";
const ASTRAL_KEY = "emoji\u{1F642}key";
const COMBINING_KEY = "é";
const PRECOMPOSED_KEY = "é";
const LONG_KEY = "k".repeat(1000);
const UPPER_KEY = "Case";
const LOWER_KEY = "case";
const KEYWORD_KEY = "export default class extends implements";
const PROTOTYPE_KEY = "__proto__";
const CONSTRUCTOR_KEY = "constructor";
const TO_STRING_KEY = "toString";

const ORDERED_KEYS: readonly string[] = [
  NEWLINE_KEY,
  WHITESPACE_KEY,
  ASTRAL_KEY,
  COMBINING_KEY,
  PRECOMPOSED_KEY,
  LONG_KEY,
  UPPER_KEY,
  LOWER_KEY,
  KEYWORD_KEY,
  PROTOTYPE_KEY,
  CONSTRUCTOR_KEY,
  TO_STRING_KEY,
];

const CATALOG = `{\n${ORDERED_KEYS.map(
  (key, index) => `  ${JSON.stringify(key)}: ${JSON.stringify(`value ${index}`)}`,
).join(",\n")}\n}\n`;

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    noEmit: true,
    skipLibCheck: true,
    types: [],
  },
  files: ["usage.ts"],
};

function usage(keys: readonly string[]): string {
  return `import type {
  VerbatraMessageArguments,
  VerbatraMessageKey,
  VerbatraMessages,
} from "./verbatra-types.js";

declare function t<Key extends VerbatraMessageKey>(
  key: Key,
  args: VerbatraMessageArguments<Key>,
): string;

${keys.map((key) => `t(${JSON.stringify(key)}, {});`).join("\n")}

${keys
  .map(
    (key, index) =>
      `// @ts-expect-error every declared key takes no argument here\nconst reject${index} = t(${JSON.stringify(
        key,
      )}, { surprise: 1 });\nvoid reject${index};`,
  )
  .join("\n")}

// @ts-expect-error a key differing only in case from a declared one is still a different key
t("CASE", {});

export const upper: VerbatraMessages[${JSON.stringify(UPPER_KEY)}] = {};
export const lower: VerbatraMessages[${JSON.stringify(LOWER_KEY)}] = {};
`;
}

let declaration = "";
let members: readonly string[] = [];
let declaredKeys = 0;
let tscOutput = "";
let controlOutput = "";

function memberFor(key: string): string | undefined {
  return members.find((member) => member.startsWith(`  ${JSON.stringify(key)}:`));
}

async function compile(dir: string, source: string): Promise<string> {
  await writeFile(join(dir, "verbatra-types.d.ts"), declaration, "utf8");
  await writeFile(join(dir, "usage.ts"), source, "utf8");
  await writeFile(join(dir, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2), "utf8");
  try {
    return (await run(TSC, ["-p", dir], { cwd: dir })).stdout;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}` || String(error);
  }
}

beforeAll(async () => {
  const project = await makeTempDir();
  await mkdir(join(project, "locales"), { recursive: true });
  await writeFile(join(project, "locales", "en.json"), CATALOG, "utf8");

  const result = await generateTypes({ config: baseConfig(), cwd: project });
  declaredKeys = result.keys;
  declaration = await readFile(result.path, "utf8");
  const body = /export interface VerbatraMessages \{\n([\s\S]*?)\n\}/.exec(declaration);
  members = body?.[1] === undefined ? [] : body[1].split("\n");

  tscOutput = await compile(await makeTempDir(), usage(ORDERED_KEYS));
  controlOutput = await compile(
    await makeTempDir(),
    `${usage(ORDERED_KEYS)}\nt("no such key at all", {});\n`,
  );
}, 300_000);

describe("adversarial catalog keys survive into a declaration that still compiles", () => {
  it("declares every key the catalog carried, dropping none of them", () => {
    expect(declaredKeys).toBe(ORDERED_KEYS.length);
    expect(members).toHaveLength(ORDERED_KEYS.length);
  });

  it("compiles the whole set under strict TypeScript", () => {
    expect(tscOutput).toBe("");
  });

  it("really ran tsc: the same file plus one undeclared key is reported", () => {
    expect(controlOutput).not.toBe("");
    expect(controlOutput).toContain("no such key at all");
  });

  it("escapes a key containing a newline rather than emitting a raw line break", () => {
    expect(memberFor(NEWLINE_KEY)).toBe('  "line\\nbreak": VerbatraNoArguments;');
    expect(declaration).not.toContain("line\nbreak");
  });

  it("keeps a key that is only whitespace, spaces intact", () => {
    expect(memberFor(WHITESPACE_KEY)).toBe('  "   ": VerbatraNoArguments;');
  });

  it("emits an astral emoji as its literal surrogate pair, not an escape or a replacement", () => {
    expect(memberFor(ASTRAL_KEY)).toBe('  "emoji\u{1F642}key": VerbatraNoArguments;');
    expect(declaration).not.toContain("\\ud83d");
    expect(declaration).not.toContain("�");
  });

  it("keeps a combining mark separate from its precomposed twin, declaring both", () => {
    expect(memberFor(COMBINING_KEY)).toBe('  "é": VerbatraNoArguments;');
    expect(memberFor(PRECOMPOSED_KEY)).toBe('  "é": VerbatraNoArguments;');
    expect(memberFor(COMBINING_KEY)).not.toBe(memberFor(PRECOMPOSED_KEY));
  });

  it("emits a thousand-character key whole, neither truncated nor wrapped", () => {
    expect(memberFor(LONG_KEY)).toBe(`  "${LONG_KEY}": VerbatraNoArguments;`);
    expect(declaration).toContain(LONG_KEY);
  });

  it("keeps two keys differing only by case as two distinct members", () => {
    expect(memberFor(UPPER_KEY)).toBe('  "Case": VerbatraNoArguments;');
    expect(memberFor(LOWER_KEY)).toBe('  "case": VerbatraNoArguments;');
    expect(members.filter((member) => /^ {2}"[Cc]ase":/.test(member))).toHaveLength(2);
  });

  it("quotes a key that reads as a sequence of TypeScript keywords", () => {
    expect(memberFor(KEYWORD_KEY)).toBe(
      '  "export default class extends implements": VerbatraNoArguments;',
    );
  });

  it("declares prototype-shaped keys as ordinary members rather than losing them", () => {
    expect(memberFor(PROTOTYPE_KEY)).toBe('  "__proto__": VerbatraNoArguments;');
    expect(memberFor(CONSTRUCTOR_KEY)).toBe('  "constructor": VerbatraNoArguments;');
    expect(memberFor(TO_STRING_KEY)).toBe('  "toString": VerbatraNoArguments;');
  });

  it("keeps the source document order across every one of them", () => {
    expect(members).toEqual(
      ORDERED_KEYS.map((key) => `  ${JSON.stringify(key)}: VerbatraNoArguments;`),
    );
  });
});

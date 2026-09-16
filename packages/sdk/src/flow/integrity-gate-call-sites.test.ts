import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FLOW_ROOT = new URL(".", import.meta.url).pathname;
const SRC_ROOT = join(FLOW_ROOT, "..");

const COVERED_BY: Readonly<Record<string, readonly string[]>> = {
  "flow/integrity-gate.ts": ["integrity-gate.test.ts", "integrity-gate-markup.test.ts"],
  "flow/key-integrity.ts": ["key-integrity.test.ts", "markup-verdict.test.ts"],
  "flow/markup-verdict.ts": ["markup-verdict.test.ts"],
  "flow/locale-run.ts": ["integrity-gate-agreement.test.ts"],
  "flow/edit-entry.ts": ["integrity-gate-agreement.test.ts"],
  "flow/retranslate-entry.ts": ["integrity-gate-agreement.test.ts"],
  "flow/workbook/import-locale.ts": ["integrity-gate-agreement.test.ts"],
  "flow/plural-generation.ts": ["plural-generation.markup.test.ts"],
  "flow/pseudo.ts": ["pseudo.integrity.test.ts"],
};

const GATE_IMPORT =
  /(?:import|export)\s*\{[^}]*\bgateCandidateValue\b[^}]*\}\s*from\s*"[^"]*integrity-gate\.js"/s;

const VERDICT_IMPORT =
  /(?:import|export)\s*\{[^}]*\bjudgeEntryMarkup\b[^}]*\}\s*from\s*"[^"]*markup-verdict\.js"/s;

const WHOLE_MODULE_IMPORT =
  /(?:import\s*\*\s*as\s+[\w$]+|export\s*\*(?:\s*as\s+[\w$]+)?)\s*from\s*"[^"]*(?:integrity-gate|markup-verdict)\.js"/;

const MARKUP_IMPORT =
  /(?:import|export)\s*\{[^}]*\bcompareInlineMarkup\b[^}]*\}\s*from\s*"@verbatra\/core"/s;

const DYNAMIC_JUDGE_IMPORT =
  /\bimport\s*\(\s*["'`][^"'`]*(?:integrity-gate|markup-verdict)\.js["'`]\s*\)/;

const CORE_MODULE_REFERENCE =
  /import\s*\*\s*as\s+[\w$]+\s*from\s*"@verbatra\/core"|\bimport\s*\(\s*["'`]@verbatra\/core["'`]\s*\)/;

const COMPARISON_NAME = /\bcompareInlineMarkup\b/;

const COMMENT = /\/\*[\s\S]*?\*\/|(?<![:"'`])\/\/[^\n]*/g;

function sourceFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFilesUnder(path, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      out.push(path);
    }
  }
  return out;
}

function comparesThroughCoreModule(code: string): boolean {
  return CORE_MODULE_REFERENCE.test(code) && COMPARISON_NAME.test(code);
}

function judgesMarkup(source: string): boolean {
  const code = source.replace(COMMENT, "");
  return (
    GATE_IMPORT.test(code) ||
    VERDICT_IMPORT.test(code) ||
    WHOLE_MODULE_IMPORT.test(code) ||
    MARKUP_IMPORT.test(code) ||
    DYNAMIC_JUDGE_IMPORT.test(code) ||
    comparesThroughCoreModule(code)
  );
}

function gateCallSites(): readonly string[] {
  return sourceFilesUnder(SRC_ROOT)
    .filter((path) => judgesMarkup(readFileSync(path, "utf8")))
    .map((path) => relative(SRC_ROOT, path))
    .sort();
}

describe("every place that judges inline markup is named by a test that drives it", () => {
  const callSites = gateCallSites();

  it("finds a non-trivial set of call sites, so the comparison cannot pass vacuously", () => {
    expect(callSites.length).toBeGreaterThanOrEqual(7);
    expect(callSites).toContain("flow/integrity-gate.ts");
  });

  it("has an entry for each one, so a new call site fails here instead of going uncovered", () => {
    expect(callSites).toEqual(Object.keys(COVERED_BY).sort());
  });

  it.each(Object.entries(COVERED_BY).flatMap(([site, files]) => files.map((f) => [site, f])))(
    "%s names a test file that exists: %s",
    (_site, fileName) => {
      expect(() => readFileSync(join(FLOW_ROOT, fileName), "utf8")).not.toThrow();
    },
  );

  it("sees a call site whose import renames the gate, which a call-text scan would miss", () => {
    const aliased =
      'import { gateCandidateValue as judge } from "./integrity-gate.js";\njudge(a, b, c);';
    expect(aliased).not.toContain("gateCandidateValue(");
    expect(judgesMarkup(aliased)).toBe(true);
  });

  it("sees a call site that compares markup directly rather than through the gate", () => {
    expect(judgesMarkup('import { compareInlineMarkup } from "@verbatra/core";')).toBe(true);
  });

  it("sees a call site that judges markup through the shared verdict helper", () => {
    expect(judgesMarkup('import { judgeEntryMarkup } from "./markup-verdict.js";')).toBe(true);
  });

  it.each([
    'import * as gate from "./integrity-gate.js";',
    'import * as verdict from "../markup-verdict.js";',
    'import * as core from "@verbatra/core";\ncore.compareInlineMarkup(a, b);',
    'export { gateCandidateValue } from "./integrity-gate.js";',
    'export { judgeEntryMarkup as judge } from "./markup-verdict.js";',
    'export { compareInlineMarkup } from "@verbatra/core";',
    'export * from "./integrity-gate.js";',
    'export * as verdict from "./markup-verdict.js";',
  ])("sees a call site that reaches the judges through %j", (source) => {
    expect(judgesMarkup(source)).toBe(true);
  });

  it.each([
    'const gate = await import("./integrity-gate.js");',
    "const { judgeEntryMarkup } = await import('../markup-verdict.js');",
    "const verdict = await import(`./markup-verdict.js`);",
    'const core = await import("@verbatra/core");\ncore.compareInlineMarkup(a, b);',
    'const { compareInlineMarkup: judge } = await import("@verbatra/core");\njudge(a, b);',
    '(await import("@verbatra/core")).compareInlineMarkup(a, b);',
    'import * as core from "@verbatra/core";\nconst { compareInlineMarkup: judge } = core;',
    'import * as core from "@verbatra/core";\nconst judge = core["compareInlineMarkup"];',
  ])("sees a call site that reaches the judges dynamically or by destructuring: %j", (source) => {
    expect(judgesMarkup(source)).toBe(true);
  });

  it("does not claim a module that imports core dynamically without comparing markup", () => {
    expect(judgesMarkup('const core = await import("@verbatra/core");\ncore.contentHash(a);')).toBe(
      false,
    );
  });

  it("does not claim a core import whose only mention of the comparison is a comment", () => {
    expect(
      judgesMarkup('import * as core from "@verbatra/core";\n// core.compareInlineMarkup(a, b)\n'),
    ).toBe(false);
  });

  it("does not claim a module that imports core as a namespace without comparing markup", () => {
    expect(judgesMarkup('import * as core from "@verbatra/core";\ncore.contentHash(a);')).toBe(
      false,
    );
  });

  it("does not claim a module that re-exports only the reason tuple from the gate", () => {
    expect(judgesMarkup('export { INTEGRITY_GATE_REASONS } from "./flow/integrity-gate.js";')).toBe(
      false,
    );
  });

  it("does not claim an ordinary module that merely mentions the names in a comment", () => {
    expect(
      judgesMarkup("// gateCandidateValue( and compareInlineMarkup are used elsewhere\n"),
    ).toBe(false);
  });
});

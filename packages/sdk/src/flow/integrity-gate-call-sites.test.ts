import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FLOW_ROOT = new URL(".", import.meta.url).pathname;
const SRC_ROOT = join(FLOW_ROOT, "..");

const COVERED_BY: Readonly<Record<string, readonly string[]>> = {
  "flow/integrity-gate.ts": ["integrity-gate.test.ts", "integrity-gate-markup.test.ts"],
  "flow/key-integrity.ts": ["key-integrity.test.ts"],
  "flow/locale-run.ts": ["integrity-gate-agreement.test.ts"],
  "flow/edit-entry.ts": ["integrity-gate-agreement.test.ts"],
  "flow/retranslate-entry.ts": ["integrity-gate-agreement.test.ts"],
  "flow/workbook/import-locale.ts": ["integrity-gate-agreement.test.ts"],
  "flow/plural-generation.ts": ["plural-generation.markup.test.ts"],
  "flow/pseudo.ts": ["pseudo.integrity.test.ts"],
};

const GATE_IMPORT =
  /import\s*\{[^}]*\bgateCandidateValue\b[^}]*\}\s*from\s*"[^"]*integrity-gate\.js"/s;

const MARKUP_IMPORT = /import\s*\{[^}]*\bcompareInlineMarkup\b[^}]*\}\s*from\s*"@verbatra\/core"/s;

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

function judgesMarkup(source: string): boolean {
  return GATE_IMPORT.test(source) || MARKUP_IMPORT.test(source);
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

  it("does not claim an ordinary module that merely mentions the names in a comment", () => {
    expect(
      judgesMarkup("// gateCandidateValue( and compareInlineMarkup are used elsewhere\n"),
    ).toBe(false);
  });
});

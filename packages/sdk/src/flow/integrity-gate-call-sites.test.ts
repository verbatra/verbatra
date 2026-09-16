import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FLOW_ROOT = new URL(".", import.meta.url).pathname;
const SRC_ROOT = join(FLOW_ROOT, "..");

const COVERED_BY: Readonly<Record<string, string>> = {
  "flow/integrity-gate.ts": "integrity-gate.test.ts and integrity-gate-markup.test.ts",
  "flow/locale-run.ts": "integrity-gate-agreement.test.ts (runLocale row)",
  "flow/edit-entry.ts": "integrity-gate-agreement.test.ts (editEntry row)",
  "flow/retranslate-entry.ts": "integrity-gate-agreement.test.ts (retranslateEntry row)",
  "flow/workbook/import-locale.ts": "integrity-gate-agreement.test.ts (importLocale row)",
  "flow/plural-generation.ts": "plural-generation.markup.test.ts",
  "flow/pseudo.ts": "pseudo.integrity.test.ts",
};

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

function gateCallSites(): readonly string[] {
  return sourceFilesUnder(SRC_ROOT)
    .filter((path) => readFileSync(path, "utf8").includes("gateCandidateValue("))
    .map((path) => relative(SRC_ROOT, path))
    .sort();
}

describe("every place that calls the integrity gate is named by a test that drives it", () => {
  const callSites = gateCallSites();

  it("finds a non-trivial set of call sites, so the comparison cannot pass vacuously", () => {
    expect(callSites.length).toBeGreaterThanOrEqual(6);
    expect(callSites).toContain("flow/integrity-gate.ts");
  });

  it("has an entry for each one, so a new call site fails here instead of going uncovered", () => {
    expect(callSites).toEqual(Object.keys(COVERED_BY).sort());
  });

  it.each(Object.values(COVERED_BY))("names a test file that exists: %s", (description) => {
    const fileName = description.split(" ")[0] ?? "";
    expect(() => readFileSync(join(FLOW_ROOT, fileName), "utf8")).not.toThrow();
  });
});

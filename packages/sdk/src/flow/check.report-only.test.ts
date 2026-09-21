import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

function productionSources(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
    const path = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      return productionSources(path);
    }
    return dirent.name.endsWith(".ts") && !dirent.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("static proof: the consistency report stays out of every run and gate path", () => {
  const referencing = productionSources(SRC_ROOT)
    .filter((path) => readFileSync(path, "utf8").includes("findInconsistentTranslations"))
    .map((path) => relative(SRC_ROOT, path));

  it("is computed by check alone", () => {
    expect(referencing).toEqual(["flow/check.ts"]);
  });

  it("never reaches the integrity gate, the locale run, or the run summary", () => {
    for (const file of ["integrity-gate.ts", "locale-run.ts", "summary.ts"]) {
      const content = readFileSync(join(SRC_ROOT, "flow", file), "utf8");
      expect(content).not.toMatch(/inconsisten/i);
    }
  });
});

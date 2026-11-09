import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SDK_SRC = fileURLToPath(new URL("../", import.meta.url));

const DEFINITION_FILE = join(SDK_SRC, "lock", "lock-file.ts");

const RUNS_INSIDE_CALLERS_LOCK = join(SDK_SRC, "flow", "apply-entry-edits.ts");

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("static proof: every updateLockFileLocale caller also holds withLocaleWriteLock", () => {
  it("holds for every non-test source file under packages/sdk/src", async () => {
    const files = await listSourceFiles(SDK_SRC);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      if (file === DEFINITION_FILE || file === RUNS_INSIDE_CALLERS_LOCK) {
        continue;
      }
      const content = await readFile(file, "utf8");
      if (content.includes("updateLockFileLocale(") && !content.includes("withLocaleWriteLock(")) {
        offenders.push(relative(SDK_SRC, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("holds for every caller of applyEntryEdits, which updates the lock-file inside the caller's lock", async () => {
    const files = await listSourceFiles(SDK_SRC);
    const callers: string[] = [];
    const offenders: string[] = [];
    for (const file of files) {
      if (file === RUNS_INSIDE_CALLERS_LOCK) {
        continue;
      }
      const content = await readFile(file, "utf8");
      if (content.includes("applyEntryEdits(")) {
        callers.push(relative(SDK_SRC, file));
        if (!content.includes("withLocaleWriteLock(")) {
          offenders.push(relative(SDK_SRC, file));
        }
      }
    }

    expect(callers.sort()).toEqual(["flow/edit-entry.ts", "flow/value-replace.ts"]);
    expect(offenders).toEqual([]);
  });

  it("the definition file guards its own read-modify-write with withLockFileGuard", async () => {
    const content = await readFile(DEFINITION_FILE, "utf8");
    expect(content).toContain("updateLockFileLocale(");
    expect(content).toContain("withLockFileGuard(");
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = fileURLToPath(new URL(".", import.meta.url));

const PORT_OWNER = "source-fs-port.ts";

const ALLOWED = new Set([PORT_OWNER]);

const MODULE_SPECIFIER = /\b(?:from|import)\b\s*\(?\s*["']([^"']+)["']/g;
const NODE_FS_SPECIFIER = /^(?:node:)?fs(?:\/promises)?$/;

function importsNodeFs(source: string): boolean {
  for (const match of source.matchAll(MODULE_SPECIFIER)) {
    const specifier = match[1];
    if (specifier !== undefined && NODE_FS_SPECIFIER.test(specifier)) {
      return true;
    }
  }
  return false;
}

function productionSources(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"))
    .filter((entry) => !entry.includes(".test."))
    .map((entry) => entry.split("\\").join("/"))
    .filter((entry) => !ALLOWED.has(entry))
    .sort();
}

describe("static proof: extraction sources reach the file system only through the SourceFs port", () => {
  const sources = productionSources();

  it("finds production sources to scan", () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
  });

  it("no production source outside the port imports the file system, prefixed or not", () => {
    const offenders = sources.filter((entry) =>
      importsNodeFs(readFileSync(`${SRC_ROOT}${entry}`, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});

describe("the guard's detector", () => {
  it.each([
    'import { mkdir } from "node:fs/promises";',
    'import { readFileSync } from "node:fs";',
    'import { mkdir } from "fs/promises";',
    'import { readFileSync } from "fs";',
    "const { mkdir } = await import('node:fs/promises');",
    'export { readFileSync } from "fs";',
  ])("catches %s", (source) => {
    expect(importsNodeFs(source)).toBe(true);
  });

  it.each([
    'import { tokenizeSource } from "./scan/tokenize.js";',
    'import { nodeSourceFs } from "./source-fs-port.js";',
    'import { join, relative } from "node:path";',
    'import watcher from "fsevents";',
    'import { copy } from "fs-extra";',
  ])("does not flag %s", (source) => {
    expect(importsNodeFs(source)).toBe(false);
  });
});

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const APP_DIR = resolve(import.meta.dirname, "..");
const SCRIPTS_DIR = join(APP_DIR, "scripts");
const LIB_IMPORT = /from\s+["'](\.\.\/lib\/[^"']+\.ts)["']/g;

function libModulesImportedByScripts(): ReadonlyArray<string> {
  const modules = readdirSync(SCRIPTS_DIR)
    .filter((file) => file.endsWith(".mjs"))
    .flatMap((file) =>
      [...readFileSync(join(SCRIPTS_DIR, file), "utf8").matchAll(LIB_IMPORT)].map(([, specifier]) =>
        resolve(SCRIPTS_DIR, specifier ?? ""),
      ),
    );
  return [...new Set(modules)].sort();
}

describe("lib modules a node script imports", () => {
  const modules = libModulesImportedByScripts();

  it("include the license notices the licenses:sync script reads", () => {
    expect(modules).toContain(join(APP_DIR, "lib/third-party-licenses.ts"));
  });

  it.each(modules.map((path) => [path.slice(APP_DIR.length + 1), path]))(
    "loads %s under plain node, as the script runs it",
    (_name, path) => {
      const output = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `await import(${JSON.stringify(pathToFileURL(path).href)}); console.log("loaded");`,
        ],
        { cwd: APP_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      expect(output.trim()).toBe("loaded");
    },
  );
});

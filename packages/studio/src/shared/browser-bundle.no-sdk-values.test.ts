import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BROWSER_DIRS = ["../app", "../client", ".", "../webmcp"];
const SDK_IMPORT = /import\s+(type\s+)?\{[^}]*\}\s+from\s+"@verbatra\/sdk"/g;

function sources(dir: string): string[] {
  return readdirSync(join(import.meta.dirname, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join(dir, file));
}

describe("the browser bundle", () => {
  it.each(BROWSER_DIRS.flatMap(sources))(
    "%s imports only types from the SDK, since its values pull node:os into the page",
    (file) => {
      const text = readFileSync(join(import.meta.dirname, file), "utf8");
      const valueImports = [...text.matchAll(SDK_IMPORT)].filter((match) => match[1] === undefined);

      expect(valueImports.map((match) => match[0])).toEqual([]);
    },
  );
});

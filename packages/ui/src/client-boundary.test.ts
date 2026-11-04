import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));

const sources = readdirSync(SRC)
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$|test-support/.test(file))
  .map((file) => ({ file, text: readFileSync(join(SRC, file), "utf8") }));

const HOOK_IMPORT = /import\s*\{[^}]*\buse[A-Z]\w*\b[^}]*\}\s*from\s*"react"/;

describe("ui modules that use React hooks", () => {
  it("find the sources to inspect", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("declare a client boundary, so a server-rendered host can import the barrel", () => {
    const missing = sources
      .filter(({ text }) => HOOK_IMPORT.test(text) && !text.startsWith('"use client";'))
      .map(({ file }) => file);

    expect(missing).toEqual([]);
  });

  it("keep the directive only where a hook needs it", () => {
    const needless = sources
      .filter(({ text }) => text.startsWith('"use client";') && !HOOK_IMPORT.test(text))
      .map(({ file }) => file);

    expect(needless).toEqual([]);
  });
});

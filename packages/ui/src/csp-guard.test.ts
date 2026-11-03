import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));

function runtimeSources(): readonly string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join(SRC, file));
}

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ["a created style element", /createElement\(\s*["'`]style["'`]/],
  ["insertRule", /\binsertRule\b/],
  ["a replaceSync stylesheet", /\breplaceSync\b/],
  ["an innerHTML write", /\.(?:inner|outer)HTML\b/],
  ["insertAdjacentHTML", /\binsertAdjacentHTML\b/],
  ["a style tag literal", /<style\b/i],
];

describe("ui source stays CSP-safe for a style-src 'self' host", () => {
  const sources = runtimeSources();

  it("has runtime sources to guard", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)("never uses %s", (_label, pattern) => {
    const offenders = sources.filter((file) => pattern.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

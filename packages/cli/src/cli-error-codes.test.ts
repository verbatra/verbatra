import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_ERROR_CODES } from "./cli-error-codes.js";
import { CLI_ERROR_CODES as PUBLISHED_CLI_ERROR_CODES } from "./lib.js";

const SRC_ROOT = fileURLToPath(new URL(".", import.meta.url));

const LIST_OWNER = "cli-error-codes.ts";

const UPPER_SNAKE_LITERAL = /["'`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)["'`]/g;

const NOT_AN_ERROR_CODE = /^(?:VERBATRA_|ERR_)/;

function productionSources(): string[] {
  return readdirSync(SRC_ROOT)
    .filter((entry) => entry.endsWith(".ts") && !entry.includes(".test."))
    .filter((entry) => entry !== LIST_OWNER && entry !== "test-support.ts")
    .sort();
}

function emittedCodes(): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const file of productionSources()) {
    const source = readFileSync(`${SRC_ROOT}${file}`, "utf8");
    for (const match of source.matchAll(UPPER_SNAKE_LITERAL)) {
      const literal = match[1];
      if (literal !== undefined && !NOT_AN_ERROR_CODE.test(literal)) {
        codes.add(literal);
      }
    }
  }
  return codes;
}

describe("CLI_ERROR_CODES: the single list of codes the CLI raises itself", () => {
  it("lists every upper-snake-case code literal in the CLI source", () => {
    const listed = new Set<string>(CLI_ERROR_CODES);

    expect([...emittedCodes()].filter((code) => !listed.has(code))).toEqual([]);
  });

  it("lists no code the CLI source never raises", () => {
    const emitted = emittedCodes();

    expect(CLI_ERROR_CODES.filter((code) => !emitted.has(code))).toEqual([]);
  });

  it("holds each code once, in alphabetical order", () => {
    expect([...CLI_ERROR_CODES]).toEqual([...new Set(CLI_ERROR_CODES)].sort());
  });

  it("is exported from the package's library entry", () => {
    expect(PUBLISHED_CLI_ERROR_CODES).toBe(CLI_ERROR_CODES);
  });
});

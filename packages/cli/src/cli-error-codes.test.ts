import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_ERROR_CODES } from "./cli-error-codes.js";
import { CLI_ERROR_CODES as PUBLISHED_CLI_ERROR_CODES } from "./lib.js";

const SRC_ROOT = fileURLToPath(new URL(".", import.meta.url));

const LIST_OWNER = "cli-error-codes.ts";

const CODE = String.raw`["'\`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)["'\`]`;

const CODE_POSITIONS: readonly RegExp[] = [
  new RegExp(String.raw`\b[A-Za-z]*Error\(\s*${CODE}`, "g"),
  new RegExp(String.raw`\bcode:\s*${CODE}`, "g"),
  new RegExp(String.raw`:\s*CliErrorCode\s*=\s*${CODE}`, "g"),
];

function productionSources(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts") && !entry.includes(".test."))
    .filter((entry) => basename(entry) !== LIST_OWNER && basename(entry) !== "test-support.ts")
    .sort();
}

function codesIn(source: string): string[] {
  return CODE_POSITIONS.flatMap((pattern) =>
    [...source.matchAll(pattern)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])),
  );
}

function emittedCodes(): ReadonlySet<string> {
  return new Set(
    productionSources().flatMap((file) => codesIn(readFileSync(join(SRC_ROOT, file), "utf8"))),
  );
}

describe("the code-position scan behind the parity check", () => {
  it.each([
    [
      "a usage error constructor",
      'throw new CliUsageError("INVALID_PORT", message);',
      ["INVALID_PORT"],
    ],
    [
      "a constructor argument on the next line",
      'new CliUsageError(\n  "CONFIG_EXISTS",',
      ["CONFIG_EXISTS"],
    ],
    [
      "a helper that builds an error",
      'ambiguityError("FORMAT_AMBIGUOUS", "format")',
      ["FORMAT_AMBIGUOUS"],
    ],
    ["a code property", '{ code: "INVALID_DEBOUNCE", describe: "x" }', ["INVALID_DEBOUNCE"]],
    ["a typed constant", 'const FALLBACK: CliErrorCode = "CLI_ERROR";', ["CLI_ERROR"]],
    ["an environment variable name", 'process.env["OPENAI_API_KEY"]', []],
    ["a code the CLI only compares against", 'if (error.code === "CONFIG_NOT_FOUND") {', []],
    ["an upper-snake literal in prose", 'const hint = "Set VERBATRA_NETWORK_POLICY";', []],
  ])("reads %s", (_label, source, expected) => {
    expect(codesIn(source)).toEqual(expected);
  });
});

describe("CLI_ERROR_CODES: the single list of codes the CLI raises itself", () => {
  it("lists every code the CLI source raises, in any source directory", () => {
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

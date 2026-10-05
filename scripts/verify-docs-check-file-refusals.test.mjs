import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function readDocPage(prefix, suffix) {
  return readRepoFile(`apps/docs/content/docs/${prefix}${suffix}.mdx`);
}

function projectWideCheckFlags() {
  const source = readRepoFile("packages/cli/src/run.ts");
  const block = /const PROJECT_WIDE_CHECK_FLAGS = \[([\s\S]*?)\] as const;/.exec(source);
  if (block === null) {
    throw new Error("PROJECT_WIDE_CHECK_FLAGS not found in packages/cli/src/run.ts");
  }
  return [...block[1].matchAll(/\["(--[a-z-]+)"/g)].map((match) => match[1]);
}

function flagsIn(text) {
  return [...text.matchAll(/`(--[a-z-]+)`/g)].map((match) => match[1]);
}

function checkFileRowRefusals(suffix) {
  const row = readDocPage("cli/check", suffix)
    .split("\n")
    .find((line) => line.startsWith("| `--file` |"));
  if (row === undefined) {
    throw new Error(`cli/check${suffix}.mdx has no --file row`);
  }
  const effect = row.split(" | ").at(-1);
  return flagsIn(effect);
}

function invalidOptionRefusals(suffix) {
  const page = readDocPage("(reference)/error-codes", suffix);
  const section = page.slice(page.indexOf("### INVALID_OPTION\n"));
  const description = section.split("\n")[2];
  const start = description.indexOf("`check --file`");
  if (start === -1) {
    throw new Error(`error-codes${suffix}.mdx INVALID_OPTION does not name check --file`);
  }
  return flagsIn(description.slice(start));
}

const FLAGS = projectWideCheckFlags();

describe("check --file refusals in the docs", () => {
  it("reads the refused flags from the CLI, so the comparisons cannot pass vacuously", () => {
    expect(FLAGS).toContain("--sensitive");
    expect(FLAGS.length).toBeGreaterThanOrEqual(4);
  });

  it.each(LOCALE_SUFFIXES)(
    "the cli/check%s.mdx --file row names exactly the refused flags",
    (suffix) => {
      expect(checkFileRowRefusals(suffix)).toEqual(FLAGS);
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "error-codes%s.mdx INVALID_OPTION names exactly the refused flags for check --file",
    (suffix) => {
      expect(invalidOptionRefusals(suffix)).toEqual(FLAGS);
    },
  );
});

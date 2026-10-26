import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS_TYPES = resolve(REPO_ROOT, "packages/sdk/src/progress/types.ts");
const PAGE = "apps/docs/content/docs/sdk/run";
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

function unionMembers(source) {
  const union = /export type ProgressEvent =([^;]*);/.exec(source)?.[1];
  if (union === undefined) throw new Error("the ProgressEvent union could not be located");
  return union.match(/[A-Z]\w+/g);
}

function interfaceFields(source, name) {
  const body = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source)?.[1];
  if (body === undefined) throw new Error(`the interface ${name} could not be located`);
  const fields = [...body.matchAll(/^ {2}readonly (\w+)(\??):/gm)].map((m) => `${m[1]}${m[2]}`);
  return {
    type: /readonly type: "([^"]+)"/.exec(body)?.[1],
    fields: fields.filter((f) => f !== "type"),
  };
}

function codeEvents() {
  const source = readFileSync(PROGRESS_TYPES, "utf8");
  return Object.fromEntries(
    unionMembers(source).map((name) => {
      const { type, fields } = interfaceFields(source, name);
      return [type, [...fields].sort()];
    }),
  );
}

function tableEvents(text) {
  const block = /^\| --- \| --- \| --- \|\n((?:\| `[a-z-]+` \|[^\n]*\n)+)/m.exec(text)?.[1];
  if (block === undefined) throw new Error("the progress event table could not be located");
  return Object.fromEntries(
    block
      .trim()
      .split("\n")
      .map((row) => {
        const cells = row.split(/(?<!\\)\|/).map((cell) => cell.trim());
        const fields = [...(cells[3] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
        return [/`([^`]+)`/.exec(cells[1])?.[1], fields.sort()];
      }),
  );
}

describe("the ProgressEvent table on sdk/run", () => {
  const expected = codeEvents();

  it("reads every member of the union", () => {
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(12);
  });

  it.each(LOCALE_SUFFIXES)("lists the union members and their fields on page%s", (suffix) => {
    const text = readFileSync(resolve(REPO_ROOT, `${PAGE}${suffix}.mdx`), "utf8");
    expect(tableEvents(text)).toEqual(expected);
  });
});

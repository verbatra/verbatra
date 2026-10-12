import { CHECK_LOCALE, CHECK_MISSING_KEYS, CHECK_RUN_LINES } from "./check-demo";
import { GATE_REPLIES, GATE_SOURCE_VALUES } from "./gate-demo";

export type ProblemFileLine = { readonly text: string; readonly missing?: string };

export type ProblemFile = { readonly path: string; readonly lines: ReadonlyArray<ProblemFileLine> };

type Nested = { [key: string]: string | Nested };

function nest(entries: ReadonlyArray<readonly [string, string]>): Nested {
  const root: Nested = {};
  for (const [key, value] of entries) {
    const parts = key.split(".");
    const leaf = parts.slice(-1).join("");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const next = node[part];
      const branch: Nested = typeof next === "object" ? next : {};
      node[part] = branch;
      node = branch;
    }
    node[leaf] = value;
  }
  return root;
}

function fileLines(entries: ReadonlyArray<readonly [string, string]>): ReadonlyArray<string> {
  return JSON.stringify(nest(entries), null, 2).split("\n");
}

const SOURCE_ENTRIES = Object.entries(GATE_SOURCE_VALUES);

const TARGET_ENTRIES = Object.entries(GATE_REPLIES).filter(
  ([key]) => !CHECK_MISSING_KEYS.includes(key),
);

function withMissingMarks(lines: ReadonlyArray<string>): ReadonlyArray<ProblemFileLine> {
  const closing = lines.length - 2;
  return [
    ...lines.slice(0, closing).map((text) => ({ text })),
    ...CHECK_MISSING_KEYS.map((key) => ({ text: "", missing: key })),
    ...lines.slice(closing).map((text) => ({ text })),
  ];
}

export const PROBLEM_SOURCE_FILE: ProblemFile = {
  path: "locales/en.json",
  lines: fileLines(SOURCE_ENTRIES).map((text) => ({ text })),
};

export const PROBLEM_TARGET_FILE: ProblemFile = {
  path: `locales/${CHECK_LOCALE}.json`,
  lines: withMissingMarks(fileLines(TARGET_ENTRIES)),
};

export const PROBLEM_CHECK_LINES = CHECK_RUN_LINES;

export const PROBLEM_ITEM_KEYS = ["missing", "wholeFile", "placeholders"] as const;

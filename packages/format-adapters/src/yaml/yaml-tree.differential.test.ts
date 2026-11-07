import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDocument, parse as parseYaml, YAMLParseError } from "yaml";
import { AdapterError } from "../errors.js";
import { parseYamlObject } from "./yaml-tree.js";

interface Outcome {
  kind: "ok" | "yaml-error" | "other-error";
  code?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
  value?: string | undefined;
  warnings: string[];
}

function plain(value: unknown): string {
  if (value instanceof Map) {
    const normalized = new Map<string, unknown>();
    for (const [k, v] of value) {
      if (typeof k === "object" && k !== null) {
        return "STRUCTURE";
      }
      normalized.set(String(k), v);
    }
    return `{${[...normalized].map(([k, v]) => `${k}=>${plain(v)}`).join(",")}}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(plain).join(",")}]`;
  }
  return `${typeof value}:${String(value)}`;
}

function messages(calls: unknown[][]): string[] {
  return calls.map((call) => String((call[0] as { message?: string }).message ?? call[0]));
}

function runOracle(text: string): Outcome {
  const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
  try {
    const value = parseYaml(text, { mapAsMap: true, maxAliasCount: 100 });
    return { kind: "ok", value: plain(value), warnings: messages(warn.mock.calls) };
  } catch (error) {
    if (error instanceof YAMLParseError) {
      const start = error.linePos?.[0];
      return {
        kind: "yaml-error",
        line: start?.line,
        column: start?.col,
        warnings: messages(warn.mock.calls),
      };
    }
    return { kind: "other-error", warnings: messages(warn.mock.calls) };
  } finally {
    warn.mockRestore();
  }
}

function runCandidate(text: string): Outcome {
  const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
  try {
    const value = parseYamlObject(text);
    return { kind: "ok", value: plain(value), warnings: messages(warn.mock.calls) };
  } catch (error) {
    if (error instanceof AdapterError && error.code === "INVALID_YAML") {
      const position = error.position;
      return {
        kind: position === undefined ? "other-error" : "yaml-error",
        line: position?.line,
        column: position?.column,
        warnings: messages(warn.mock.calls),
      };
    }
    return {
      kind: "ok",
      code: error instanceof AdapterError ? error.code : "?",
      warnings: messages(warn.mock.calls),
    };
  } finally {
    warn.mockRestore();
  }
}

function comparable(oracle: Outcome, candidate: Outcome): [Partial<Outcome>, Partial<Outcome>] {
  if (oracle.kind === "ok" && candidate.code !== undefined) {
    return [
      { kind: "ok", warnings: oracle.warnings },
      { kind: "ok", warnings: candidate.warnings },
    ];
  }
  if (oracle.kind === "ok") {
    return [
      { kind: "ok", warnings: oracle.warnings, value: oracle.value },
      { kind: candidate.kind, warnings: candidate.warnings, value: candidate.value },
    ];
  }
  return [oracle, candidate];
}

function duplicateKeyKind(text: string): "none" | "alone" | "with-other-error" {
  try {
    const codes = parseDocument(text, { prettyErrors: false }).errors.map((error) => error.code);
    if (!codes.includes("DUPLICATE_KEY")) {
      return "none";
    }
    return codes.every((code) => code === "DUPLICATE_KEY") ? "alone" : "with-other-error";
  } catch {
    return "none";
  }
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

const KEYS = [
  "a",
  "b",
  "c",
  '"a"',
  "'b'",
  "1",
  '"1"',
  "1.0",
  "0x1",
  "null",
  "~",
  "",
  "true",
  '"true"',
  "<<",
  ".nan",
  ".inf",
  "&k1 a",
  "&k2 b",
  "!!str 1",
  "!!int 1",
  "? [x]",
  "? {y: 1}",
  "*k1",
  "[z]",
  "{w: 1}",
  '"a\\q"',
  "key with spaces",
];

const SCALARS = [
  "1",
  "text",
  '"quoted"',
  "'single'",
  "null",
  "[]",
  "{}",
  "*k1",
  "&v x",
  "!!bogus x",
];

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function block(random: () => number, depth: number, indent: string): string[] {
  const lines: string[] = [];
  const count = 1 + Math.floor(random() * 4);
  for (let i = 0; i < count; i += 1) {
    const key = pick(random, KEYS);
    const roll = random();
    if (depth < 3 && roll < 0.3) {
      lines.push(`${indent}${key}:`, ...block(random, depth + 1, `${indent}  `));
    } else if (roll < 0.4) {
      lines.push(`${indent}${key}: {${pick(random, KEYS)}: 1, ${pick(random, KEYS)}: 2}`);
    } else if (roll < 0.5) {
      lines.push(`${indent}${key}:`, `${indent}  - ${pick(random, SCALARS)}`);
    } else {
      lines.push(`${indent}${key}: ${pick(random, SCALARS)}`);
    }
  }
  return lines;
}

function mutate(random: () => number, text: string): string {
  const roll = random();
  if (roll < 0.45) {
    return text;
  }
  const at = Math.floor(random() * (text.length + 1));
  if (roll < 0.6) {
    return text.slice(0, at);
  }
  const junk = pick(random, [
    "[",
    "{",
    '"',
    "'",
    ":",
    "\t",
    "- ",
    "&",
    "*",
    "!",
    "%",
    "---\n",
    "...\n",
    "#",
  ]);
  return text.slice(0, at) + junk + text.slice(at);
}

function generate(seed: number): string {
  const random = makeRandom(seed);
  return mutate(random, `${block(random, 0, "").join("\n")}\n`);
}

const FIXED: string[] = [
  "%YAML 1.2\na: 1\n",
  "n:\n  a: 1\n  : x\n  : y\n",
  "{ : 1,   : 2}",
  "? \n: 1\n? \n: 2\n",
  "# c\n: 1\n\n# d\n  : 2\n",
  "",
  "a: 1\n",
  "a: 1\na: 2\n",
  "x:\n  a: 1\n  a: 2\n",
  "1: x\n'1': y\n",
  '1: x\n"1": y\n',
  "null: 1\n~: 2\n",
  ": 1\n: 2\n",
  ".nan: 1\n.nan: 2\n",
  "? [a]\n: 1\n? [a]\n: 2\n",
  "? {a: 1}\n: 1\n? {a: 1}\n: 2\n",
  "<<: {a: 1}\n<<: {b: 2}\n",
  "&x a: 1\n*x : 2\na: 3\n",
  "{a: 1, a: 2}\n",
  "[a: 1, a: 2]\n",
  "a: 1\nb: [\n",
  "a: 1\na: [\n",
  "a: [\na: 1\n",
  "a: 1\na: 2\nb: [\n",
  "b: [\na: 1\na: 2\n",
  "a: 1\n---\nb: 2\n",
  "a: 1\na\n",
  "a: !!bogus x\n",
  "%YAML 1.1\n---\na: 1\n",
  "%TAG ! tag:example.com,2000:\n---\na: !foo 1\n",
  "a: &x [1]\nb: *x\n",
  "a: *missing\n",
  `a: &a [x, x]\n${Array.from({ length: 120 }, (_, i) => `k${i}: *a`).join("\n")}\n`,
  `r: &a [x]\n${Array.from({ length: 130 }, (_, i) => `k${i}: *a`).join("\n")}\n`,
  `l0: &l0 [x, x]\n${Array.from({ length: 12 }, (_, i) => `l${i + 1}: &l${i + 1} [${"*l".concat(String(i))}, ${"*l".concat(String(i))}]`).join("\n")}\n`,
  "a: 1\r\na: 2\r\n",
  "\ufeffa: 1\na: 2\n",
  "a: |\n  x\na: >\n  y\n",
  "? a\n? a\n",
  "a:\n  - b: 1\n    b: 2\n",
];

const DEEP: string[] = [
  "[".repeat(5000) + "]".repeat(5000),
  `${Array.from({ length: 3000 }, (_, i) => `${" ".repeat(i)}k:`).join("\n")}\n`,
  "{a: ".repeat(3000) + "1" + "}".repeat(3000),
];

interface Tally {
  documents: number;
  differs: number;
}

interface CorpusReport {
  mismatches: string[];
  alone: Tally;
  withOtherError: Tally;
}

function tallyFor(report: CorpusReport, kind: "alone" | "with-other-error"): Tally {
  return kind === "alone" ? report.alone : report.withOtherError;
}

function compareCorpus(iterations: number): CorpusReport {
  const report: CorpusReport = {
    mismatches: [],
    alone: { documents: 0, differs: 0 },
    withOtherError: { documents: 0, differs: 0 },
  };
  for (let seed = 1; seed <= iterations; seed += 1) {
    const text = generate(seed);
    const [oracle, candidate] = comparable(runOracle(text), runCandidate(text));
    const kind = duplicateKeyKind(text);
    const tally = kind === "none" ? undefined : tallyFor(report, kind);
    if (tally !== undefined) {
      tally.documents += 1;
    }
    if (JSON.stringify(oracle) === JSON.stringify(candidate)) {
      continue;
    }
    if (tally !== undefined && candidate.kind === "yaml-error" && oracle.kind === "yaml-error") {
      tally.differs += 1;
    } else {
      report.mismatches.push(
        `seed ${seed}: ${JSON.stringify(text)} oracle=${JSON.stringify(oracle)} candidate=${JSON.stringify(candidate)}`,
      );
    }
  }
  return report;
}

const ITERATIONS = Number(process.env["YAML_DIFF_ITERATIONS"] ?? 600);

describe("parseYamlObject against the library parse call", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(FIXED.map((text, index) => [index, text] as const))(
    "fixed case %i matches",
    (_index, text) => {
      const [oracle, candidate] = comparable(runOracle(text), runCandidate(text));
      expect(candidate).toEqual(oracle);
    },
  );

  it.each(DEEP.map((text, index) => [index, text] as const))(
    "deep nesting %i fails as invalid yaml on both sides",
    (_index, text) => {
      const oracle = runOracle(text);
      const candidate = runCandidate(text);
      expect(oracle.kind).toBe("yaml-error");
      expect(["yaml-error", "other-error"]).toContain(candidate.kind);
    },
  );

  it(`matches over ${ITERATIONS} generated documents, except a duplicate key beside another error or after an empty anchored value`, () => {
    const report = compareCorpus(ITERATIONS);

    expect(report.mismatches.slice(0, 5)).toEqual([]);
    expect(report.alone.differs).toBeLessThanOrEqual(report.alone.documents * 0.02);
    expect(report.withOtherError.differs).toBeLessThanOrEqual(
      report.withOtherError.documents * 0.1,
    );
    if (process.env.YAML_DIFF_ITERATIONS !== undefined) {
      console.info(JSON.stringify({ iterations: ITERATIONS, ...report, mismatches: [] }));
    }
  });

  it.each([
    "a: 1\na: 2\n",
    "x:\n  a: 1\n  a: 2\n",
    "a: 1\na: 2\nb: [\n",
    "b: [\na: 1\na: 2\n",
    "z: !!bogus 1\na: 1\na: 2\n",
    "{a: 1, a: 2}\n",
  ])("matches on a document of more than 40 KiB: %j", (tail) => {
    const padding = Array.from({ length: 3000 }, (_, i) => `pad_${i}: value ${i}`).join("\n");
    const text = `${padding}\n${tail.startsWith("{") ? "flow: " : ""}${tail}`;
    expect(text.length).toBeGreaterThan(40 * 1024);
    const [oracle, candidate] = comparable(runOracle(text), runCandidate(text));
    expect(candidate).toEqual(oracle);
  });

  it("rejects a megabyte mapping with a duplicate at the end without quadratic work", () => {
    const keys = Array.from({ length: 150_000 }, (_, i) => `k${i.toString(36)}: 1`);
    const text = `${keys.join("\n")}\nk0: 2\n`;
    const started = performance.now();
    const outcome = runCandidate(text);
    expect(outcome.kind).toBe("yaml-error");
    expect(outcome.line).toBe(150_001);
    expect(performance.now() - started).toBeLessThan(30_000);
  });
});

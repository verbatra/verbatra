import { createContext, Script } from "node:vm";
import type { TextSpan } from "./detectors.js";

export const PATTERN_TIME_LIMIT_MS = 1_000;

export type PatternRun =
  | { readonly kind: "matched"; readonly spans: readonly TextSpan[] }
  | { readonly kind: "timed-out" };

const SANDBOX: { pattern: RegExp | undefined; text: string } = { pattern: undefined, text: "" };

const CONTEXT = createContext(SANDBOX);

const MATCH_ALL = new Script(
  "Array.from(text.matchAll(pattern), (match) => [match.index, match.index + match[0].length])",
);

function isTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
  );
}

function toSpans(raw: readonly (readonly [number, number])[]): TextSpan[] {
  return raw.filter(([start, end]) => end > start).map(([start, end]) => ({ start, end }));
}

export function runPattern(
  pattern: RegExp,
  text: string,
  limitMs: number = PATTERN_TIME_LIMIT_MS,
): PatternRun {
  SANDBOX.pattern = pattern;
  SANDBOX.text = text;
  try {
    const raw = MATCH_ALL.runInContext(CONTEXT, { timeout: limitMs }) as [number, number][];
    return { kind: "matched", spans: toSpans(raw) };
  } catch (error) {
    if (isTimeout(error)) {
      return { kind: "timed-out" };
    }
    throw error;
  } finally {
    SANDBOX.pattern = undefined;
    SANDBOX.text = "";
  }
}

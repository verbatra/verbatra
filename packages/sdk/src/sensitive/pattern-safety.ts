interface Frame {
  quantified: boolean;
  alternatives: number;
  paths: number;
}

interface Scan {
  readonly stack: Frame[];
  unbounded: number;
  afterRepeat: boolean;
}

interface Repeat {
  readonly length: number;
  readonly unbounded: boolean;
  readonly upper: number;
  readonly paths: number;
}

export type UnsafePatternReason = "nested-repeat" | "several-unbounded" | "too-many-paths";

export const MAX_PATHS_WITH_UNBOUNDED = 4;

export const MAX_PATHS = 1024;

const NO_REPEAT: Repeat = { length: 0, unbounded: false, upper: 1, paths: 1 };

const BOUNDED_REPEAT = /^\{(\d+)(,(\d*))?\}/;

const BRACED_ESCAPE = /^\\[uUpP]\{[^}]*\}|^\\k<[^>]*>/;

function repeatAt(source: string, index: number): Repeat {
  const character = source.charAt(index);
  if (character === "*" || character === "+") {
    return { length: 1, unbounded: true, upper: Number.POSITIVE_INFINITY, paths: 1 };
  }
  if (character === "?") {
    return { length: 1, unbounded: false, upper: 1, paths: 2 };
  }
  const bounded = BOUNDED_REPEAT.exec(source.slice(index));
  if (bounded === null) {
    return NO_REPEAT;
  }
  const [token, low, comma, high] = bounded;
  if (comma !== undefined && high === "") {
    return { length: token.length, unbounded: true, upper: Number.POSITIVE_INFINITY, paths: 1 };
  }
  const lower = Number(low);
  const upper = comma === undefined ? lower : Number(high);
  return { length: token.length, unbounded: false, upper, paths: upper - lower + 1 };
}

function skipEscape(source: string, index: number): number {
  const braced = BRACED_ESCAPE.exec(source.slice(index));
  return index + (braced === null ? 2 : braced[0].length);
}

function skipClass(source: string, index: number): number {
  let cursor = index + 1;
  while (cursor < source.length && source.charAt(cursor) !== "]") {
    cursor = source.charAt(cursor) === "\\" ? skipEscape(source, cursor) : cursor + 1;
  }
  return cursor + 1;
}

function skipGroupMarker(source: string, index: number): number {
  if (source.charAt(index) !== "?") {
    return index;
  }
  const marker = source.charAt(index + 1);
  if (marker !== "<") {
    return index + 2;
  }
  const lookbehind = source.charAt(index + 2);
  if (lookbehind === "=" || lookbehind === "!") {
    return index + 3;
  }
  const close = source.indexOf(">", index);
  return close === -1 ? source.length : close + 1;
}

function bounded(value: number): number {
  return Math.min(value, Number.MAX_SAFE_INTEGER);
}

function top(scan: Scan): Frame | undefined {
  return scan.stack.at(-1);
}

function countRepeat(scan: Scan, repeat: Repeat): void {
  const frame = top(scan);
  if (frame !== undefined) {
    frame.quantified = true;
    frame.paths = bounded(frame.paths * repeat.paths);
  }
  if (repeat.unbounded) {
    scan.unbounded += 1;
  }
}

function groupPaths(group: Frame): number {
  return bounded(group.paths * (group.alternatives + 1));
}

function closeGroup(source: string, index: number, scan: Scan): boolean {
  const group = scan.stack.pop();
  const repeat = repeatAt(source, index + 1);
  if (group === undefined) {
    return false;
  }
  if (repeat.upper > 1 && (group.quantified || group.alternatives > 0)) {
    return true;
  }
  const parent = top(scan);
  if (parent !== undefined) {
    const times = Number.isFinite(repeat.upper) ? repeat.upper : 1;
    parent.paths = bounded(parent.paths * groupPaths(group) ** times);
    parent.quantified = parent.quantified || group.quantified;
  }
  return false;
}

const NESTED = -1;

function stepRepeat(source: string, index: number, scan: Scan): number {
  const repeat = repeatAt(source, index);
  if (repeat.length === 0) {
    scan.afterRepeat = false;
    return index + 1;
  }
  if (scan.afterRepeat && source.charAt(index) === "?") {
    scan.afterRepeat = false;
    return index + 1;
  }
  countRepeat(scan, repeat);
  scan.afterRepeat = true;
  return index + repeat.length;
}

function step(source: string, index: number, scan: Scan): number {
  const character = source.charAt(index);
  if (character !== "*" && character !== "+" && character !== "?" && character !== "{") {
    scan.afterRepeat = false;
  }
  switch (character) {
    case "\\":
      return skipEscape(source, index);
    case "[":
      return skipClass(source, index);
    case "(":
      scan.stack.push({ quantified: false, alternatives: 0, paths: 1 });
      return skipGroupMarker(source, index + 1);
    case "|": {
      const frame = top(scan);
      if (frame !== undefined) {
        frame.alternatives += 1;
      }
      return index + 1;
    }
    case ")":
      return closeGroup(source, index, scan) ? NESTED : index + 1;
    default:
      return stepRepeat(source, index, scan);
  }
}

export function unsafePatternReason(source: string): UnsafePatternReason | undefined {
  const root: Frame = { quantified: false, alternatives: 0, paths: 1 };
  const scan: Scan = { stack: [root], unbounded: 0, afterRepeat: false };
  let index = 0;
  while (index < source.length) {
    index = step(source, index, scan);
    if (index === NESTED) {
      return "nested-repeat";
    }
  }
  if (scan.unbounded > 1) {
    return "several-unbounded";
  }
  const limit = scan.unbounded > 0 ? MAX_PATHS_WITH_UNBOUNDED : MAX_PATHS;
  return groupPaths(root) > limit ? "too-many-paths" : undefined;
}

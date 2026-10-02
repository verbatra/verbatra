interface Frame {
  repeats: boolean;
  alternatives: number;
}

interface Scan {
  readonly stack: Frame[];
  unbounded: number;
  paths: number;
  afterRepeat: boolean;
}

interface Repeat {
  readonly length: number;
  readonly unbounded: boolean;
  readonly multiple: boolean;
  readonly paths: number;
}

export type UnsafePatternReason = "nested-repeat" | "several-unbounded" | "too-many-paths";

export const MAX_PATHS_WITH_UNBOUNDED = 4;

export const MAX_PATHS = 1024;

const NO_REPEAT: Repeat = { length: 0, unbounded: false, multiple: false, paths: 1 };

const BOUNDED_REPEAT = /^\{(\d+)(,(\d*))?\}/;

function repeatAt(source: string, index: number): Repeat {
  const character = source.charAt(index);
  if (character === "*" || character === "+") {
    return { length: 1, unbounded: true, multiple: true, paths: 1 };
  }
  if (character === "?") {
    return { length: 1, unbounded: false, multiple: false, paths: 2 };
  }
  const bounded = BOUNDED_REPEAT.exec(source.slice(index));
  if (bounded === null) {
    return NO_REPEAT;
  }
  const [token, low, comma, high] = bounded;
  if (comma !== undefined && high === "") {
    return { length: token.length, unbounded: true, multiple: true, paths: 1 };
  }
  const lower = Number(low);
  const upper = comma === undefined ? lower : Number(high);
  return { length: token.length, unbounded: false, multiple: upper > 1, paths: upper - lower + 1 };
}

function skipClass(source: string, index: number): number {
  let cursor = index + 1;
  while (cursor < source.length && source.charAt(cursor) !== "]") {
    cursor += source.charAt(cursor) === "\\" ? 2 : 1;
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

function multiplyPaths(scan: Scan, factor: number): void {
  scan.paths = Math.min(scan.paths * factor, Number.MAX_SAFE_INTEGER);
}

function countRepeat(scan: Scan, repeat: Repeat): void {
  const frame = scan.stack.at(-1);
  if (frame !== undefined && repeat.multiple) {
    frame.repeats = true;
  }
  if (repeat.unbounded) {
    scan.unbounded += 1;
  }
  multiplyPaths(scan, repeat.paths);
}

function closeGroup(source: string, index: number, scan: Scan): boolean {
  const group = scan.stack.pop();
  multiplyPaths(scan, (group?.alternatives ?? 0) + 1);
  const repeat = repeatAt(source, index + 1);
  const nested = group !== undefined && (group.repeats || group.alternatives > 0);
  if (repeat.multiple && nested) {
    return true;
  }
  const parent = scan.stack.at(-1);
  if (parent !== undefined && group?.repeats === true) {
    parent.repeats = true;
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
      return index + 2;
    case "[":
      return skipClass(source, index);
    case "(":
      scan.stack.push({ repeats: false, alternatives: 0 });
      return skipGroupMarker(source, index + 1);
    case "|": {
      const frame = scan.stack.at(-1);
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

function pathLimit(scan: Scan): number {
  return scan.unbounded > 0 ? MAX_PATHS_WITH_UNBOUNDED : MAX_PATHS;
}

export function unsafePatternReason(source: string): UnsafePatternReason | undefined {
  const scan: Scan = {
    stack: [{ repeats: false, alternatives: 0 }],
    unbounded: 0,
    paths: 1,
    afterRepeat: false,
  };
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
  multiplyPaths(scan, (scan.stack[0]?.alternatives ?? 0) + 1);
  return scan.paths > pathLimit(scan) ? "too-many-paths" : undefined;
}

export type ValueSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "token"; readonly text: string };

const PRINTF_TOKEN = /%(?:\d+\$)?[-+0#]*(?:[1-9]\d*)?(?:\.\d+)?(?:hh|h|ll|l|q|z|j|t|L)?[A-Za-z@]/y;
const MARKUP_TOKEN = /<\/?(?:[A-Za-z][\w:.-]*|\d+)(?:\s[^<>]*)?\/?>/y;
const ICU_HEAD = /\{\s*[^\s{},]+\s*,\s*(plural|selectordinal|select)\s*,(?:\s*offset:\s*\d+)?/y;
const ICU_SELECTOR = /[^\s{}]+\s*\{/y;
const WHITESPACE = /\s*/y;
const BRACE_SIGILS = new Set(["#", "$", "%", "@"]);
const QUOTABLE = new Set(["{", "}", "#", "|"]);

interface IcuFrame {
  readonly pound: boolean;
  phase: "selectors" | "arm";
  arms: number;
  closeStart: number;
}

interface Scan {
  readonly value: string;
  readonly braceEnds: Int32Array;
  readonly segments: ValueSegment[];
  readonly stack: IcuFrame[];
  textStart: number;
  index: number;
}

function matchBraceEnds(value: string): Int32Array {
  const ends = new Int32Array(value.length).fill(-1);
  const open: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{") {
      open.push(index);
    } else if (char === "}") {
      const start = open.pop();
      if (start !== undefined) {
        ends[start] = index + 1;
      }
    }
  }
  return ends;
}

function stickyTokenEnd(pattern: RegExp, value: string, start: number): number {
  pattern.lastIndex = start;
  return pattern.test(value) ? pattern.lastIndex : -1;
}

function balancedBraceEnd(scan: Scan, start: number): number {
  const char = scan.value[start];
  if (char === "{") {
    return scan.braceEnds[start] ?? -1;
  }
  if (char !== undefined && BRACE_SIGILS.has(char) && scan.value[start + 1] === "{") {
    return scan.braceEnds[start + 1] ?? -1;
  }
  return -1;
}

function simplePlaceholderEnd(value: string, open: number): number {
  for (let index = open + 1; index < value.length; index += 1) {
    const char = value[index];
    if (char === "}") {
      return index + 1;
    }
    if (char === "{") {
      return -1;
    }
  }
  return -1;
}

function inlineTokenEnd(value: string, start: number): number {
  const printf = stickyTokenEnd(PRINTF_TOKEN, value, start);
  if (printf !== -1) {
    return printf;
  }
  return stickyTokenEnd(MARKUP_TOKEN, value, start);
}

function quotedLiteralEnd(value: string, quote: number): number {
  const next = value[quote + 1];
  if (next === "'") {
    return quote + 2;
  }
  if (next === undefined || !QUOTABLE.has(next)) {
    return quote + 1;
  }
  let index = quote + 2;
  while (index < value.length) {
    if (value[index] !== "'") {
      index += 1;
    } else if (value[index + 1] === "'") {
      index += 2;
    } else {
      return index + 1;
    }
  }
  return value.length;
}

function pushToken(scan: Scan, start: number, end: number): void {
  if (start > scan.textStart) {
    scan.segments.push({ kind: "text", text: scan.value.slice(scan.textStart, start) });
  }
  scan.segments.push({ kind: "token", text: scan.value.slice(start, end) });
  scan.textStart = end;
  scan.index = end;
}

function openIcu(scan: Scan): boolean {
  ICU_HEAD.lastIndex = scan.index;
  const head = ICU_HEAD.exec(scan.value);
  if (head === null) {
    return false;
  }
  const parent = scan.stack.at(-1);
  scan.stack.push({
    pound: parent?.pound === true || head[1] !== "select",
    phase: "selectors",
    arms: 0,
    closeStart: -1,
  });
  pushToken(scan, scan.index, ICU_HEAD.lastIndex);
  return true;
}

function stepPlain(scan: Scan, icu: boolean): void {
  if (icu && openIcu(scan)) {
    return;
  }
  const brace = balancedBraceEnd(scan, scan.index);
  const end = brace !== -1 ? brace : inlineTokenEnd(scan.value, scan.index);
  if (end === -1) {
    scan.index += 1;
  } else {
    pushToken(scan, scan.index, end);
  }
}

function armPlaceholderEnd(scan: Scan, frame: IcuFrame): number {
  const { value, index } = scan;
  const char = value[index];
  if (char === "{") {
    return simplePlaceholderEnd(value, index);
  }
  if (char === "#" && frame.pound) {
    return index + 1;
  }
  if (char !== undefined && BRACE_SIGILS.has(char) && value[index + 1] === "{") {
    return simplePlaceholderEnd(value, index + 1);
  }
  return inlineTokenEnd(value, index);
}

function stepArm(scan: Scan, frame: IcuFrame): boolean {
  const char = scan.value[scan.index];
  if (char === "'") {
    scan.index = quotedLiteralEnd(scan.value, scan.index);
    return true;
  }
  if (char === "}") {
    frame.phase = "selectors";
    frame.arms += 1;
    frame.closeStart = scan.index;
    scan.index += 1;
    return true;
  }
  if (char === "{" && openIcu(scan)) {
    return true;
  }
  const end = armPlaceholderEnd(scan, frame);
  if (end !== -1) {
    pushToken(scan, scan.index, end);
    return true;
  }
  if (char === "{") {
    return false;
  }
  scan.index += 1;
  return true;
}

function closeIcu(scan: Scan, frame: IcuFrame, close: number): boolean {
  if (frame.arms === 0) {
    return false;
  }
  pushToken(scan, frame.closeStart, frame.closeStart + 1);
  pushToken(scan, close, close + 1);
  scan.stack.pop();
  return true;
}

function stepSelectors(scan: Scan, frame: IcuFrame): boolean {
  const next = stickyTokenEnd(WHITESPACE, scan.value, scan.index);
  if (scan.value[next] === "}") {
    return closeIcu(scan, frame, next);
  }
  const selectorEnd = stickyTokenEnd(ICU_SELECTOR, scan.value, next);
  if (selectorEnd === -1) {
    return false;
  }
  pushToken(scan, frame.closeStart === -1 ? next : frame.closeStart, selectorEnd);
  frame.closeStart = -1;
  frame.phase = "arm";
  return true;
}

function step(scan: Scan, icu: boolean): boolean {
  const frame = scan.stack.at(-1);
  if (frame === undefined) {
    stepPlain(scan, icu);
    return true;
  }
  return frame.phase === "arm" ? stepArm(scan, frame) : stepSelectors(scan, frame);
}

function scanValue(
  value: string,
  braceEnds: Int32Array,
  icu: boolean,
): readonly ValueSegment[] | undefined {
  const scan: Scan = { value, braceEnds, segments: [], stack: [], textStart: 0, index: 0 };
  while (scan.index < value.length) {
    if (!step(scan, icu)) {
      return undefined;
    }
  }
  if (scan.stack.length > 0) {
    return undefined;
  }
  if (scan.textStart < value.length) {
    scan.segments.push({ kind: "text", text: value.slice(scan.textStart) });
  }
  return scan.segments;
}

export function segmentValue(value: string): readonly ValueSegment[] {
  const braceEnds = matchBraceEnds(value);
  return scanValue(value, braceEnds, true) ?? scanValue(value, braceEnds, false) ?? [];
}

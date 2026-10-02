import {
  PRINTF_ANY_CONVERSION,
  PRINTF_FLAGS_WIDTH_PRECISION,
  PRINTF_LENGTH,
  PRINTF_POSITION,
} from "./printf-syntax.js";

const SUBMESSAGE_TYPES = new Set(["plural", "select", "selectordinal", "choice"]);

const ARGUMENT_NAME = /^(?:\d+|[A-Za-z_$][\w$-]*)$/;

const PROTECTED_TOKEN = new RegExp(
  [
    "\\{\\{[^{}]*\\}\\}",
    "\\$t\\([^()]*\\)",
    "%#@\\w+@",
    "%%",
    `%\\(\\w+\\)${PRINTF_FLAGS_WIDTH_PRECISION}${PRINTF_ANY_CONVERSION}`,
    `%${PRINTF_POSITION}${PRINTF_FLAGS_WIDTH_PRECISION}${PRINTF_LENGTH}${PRINTF_ANY_CONVERSION}`,
    "</?[A-Za-z0-9][^<>]*>",
    "&#?[A-Za-z0-9]+;",
    "@(?:\\.[A-Za-z]+)?:(?:\\([^()]*\\)|[A-Za-z0-9_.-]+)",
    "\\\\u\\{[0-9A-Fa-f]+\\}",
    "\\\\u[0-9A-Fa-f]{4}",
    "\\\\x[0-9A-Fa-f]{2}",
    "\\\\[\\s\\S]",
  ].join("|"),
  "y",
);

interface Scan {
  readonly value: string;
  readonly close: Int32Array;
  readonly mask: Uint8Array;
}

interface IcuSubmessage {
  readonly styleStart: number;
}

interface IcuArgument {
  readonly type: string | null;
  readonly styleStart: number | null;
}

function matchingBraces(value: string): Int32Array {
  const close = new Int32Array(value.length).fill(-1);
  const open: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i);
    if (char === "{") {
      open.push(i);
    } else if (char === "}") {
      const start = open.pop();
      if (start !== undefined) {
        close[start] = i;
      }
    }
  }
  return close;
}

function argumentNameEnd(value: string, open: number, close: number): number | null {
  for (let i = open + 1; i < close; i += 1) {
    const char = value.charAt(i);
    if (char === ",") {
      return i;
    }
    if (char === "{" || char === "}") {
      return null;
    }
  }
  return close;
}

function parseIcuArgument(value: string, open: number, close: number): IcuArgument | null {
  const nameEnd = argumentNameEnd(value, open, close);
  if (nameEnd === null) {
    return null;
  }
  const name = value.slice(open + 1, nameEnd).trim();
  if (!ARGUMENT_NAME.test(name)) {
    return null;
  }
  if (nameEnd === close) {
    return { type: null, styleStart: null };
  }
  const styleComma = value.indexOf(",", nameEnd + 1);
  if (styleComma === -1 || styleComma >= close) {
    return { type: value.slice(nameEnd + 1, close).trim(), styleStart: null };
  }
  return { type: value.slice(nameEnd + 1, styleComma).trim(), styleStart: styleComma + 1 };
}

function closingBrace(scan: Scan, index: number): number {
  /* v8 ignore next -- defensive: the brace map is sized to the value, so an in-range index is set. */
  return scan.close[index] ?? -1;
}

function matchToken(value: string, index: number, end: number): number {
  PROTECTED_TOKEN.lastIndex = index;
  const match = PROTECTED_TOKEN.exec(value);
  if (match === null) {
    return index;
  }
  const tokenEnd = index + match[0].length;
  return tokenEnd <= end ? tokenEnd : index;
}

function submessageAt(value: string, open: number, close: number): IcuSubmessage | null {
  const argument = parseIcuArgument(value, open, close);
  if (argument === null || argument.type === null || argument.styleStart === null) {
    return null;
  }
  return SUBMESSAGE_TYPES.has(argument.type) ? { styleStart: argument.styleStart } : null;
}

interface Frame {
  readonly arms: boolean;
  index: number;
  readonly end: number;
}

function enterBrace(scan: Scan, frame: Frame, open: number, frames: Frame[]): void {
  const closeIndex = closingBrace(scan, open);
  if (closeIndex === -1) {
    scan.mask[open] = 1;
    frame.index = open + 1;
    return;
  }
  const submessage = submessageAt(scan.value, open, closeIndex);
  if (submessage === null) {
    scan.mask.fill(1, open, closeIndex + 1);
  } else {
    scan.mask.fill(1, open, submessage.styleStart);
    scan.mask[closeIndex] = 1;
    frames.push({ arms: true, index: submessage.styleStart, end: closeIndex });
  }
  frame.index = closeIndex + 1;
}

function stepRange(scan: Scan, frame: Frame, frames: Frame[]): void {
  const i = frame.index;
  const tokenEnd = matchToken(scan.value, i, frame.end);
  if (tokenEnd > i) {
    scan.mask.fill(1, i, tokenEnd);
    frame.index = tokenEnd;
  } else if (scan.value.charAt(i) === "{") {
    enterBrace(scan, frame, i, frames);
  } else {
    frame.index = i + 1;
  }
}

function stepArms(scan: Scan, frame: Frame, frames: Frame[]): void {
  const i = frame.index;
  const closeIndex = scan.value.charAt(i) === "{" ? closingBrace(scan, i) : -1;
  scan.mask[i] = 1;
  if (closeIndex === -1) {
    frame.index = i + 1;
    return;
  }
  scan.mask[closeIndex] = 1;
  frame.index = closeIndex + 1;
  frames.push({ arms: false, index: i + 1, end: closeIndex });
}

function markAll(scan: Scan): void {
  const frames: Frame[] = [{ arms: false, index: 0, end: scan.value.length }];
  let frame = frames.at(-1);
  while (frame !== undefined) {
    if (frame.index >= frame.end) {
      frames.pop();
    } else if (frame.arms) {
      stepArms(scan, frame, frames);
    } else {
      stepRange(scan, frame, frames);
    }
    frame = frames.at(-1);
  }
}

export function protectedMask(value: string): Uint8Array {
  const scan: Scan = {
    value,
    close: matchingBraces(value),
    mask: new Uint8Array(value.length),
  };
  markAll(scan);
  return scan.mask;
}

export interface ProtectedRun {
  readonly protected: boolean;
  readonly text: string;
}

export function protectedRuns(value: string): readonly ProtectedRun[] {
  const mask = protectedMask(value);
  const runs: ProtectedRun[] = [];
  let start = 0;
  for (let index = 1; index <= value.length; index += 1) {
    if (index === value.length || mask[index] !== mask[start]) {
      runs.push({ protected: mask[start] === 1, text: value.slice(start, index) });
      start = index;
    }
  }
  return runs;
}

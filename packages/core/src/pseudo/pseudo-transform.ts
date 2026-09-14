const ACCENTS: Readonly<Record<string, string>> = {
  a: "á",
  b: "ḃ",
  c: "ć",
  d: "ḋ",
  e: "é",
  f: "ƒ",
  g: "ġ",
  h: "ĥ",
  i: "í",
  j: "ĵ",
  k: "ǩ",
  l: "ĺ",
  m: "ṁ",
  n: "ń",
  o: "ó",
  p: "ṗ",
  q: "ɋ",
  r: "ŕ",
  s: "ś",
  t: "ṫ",
  u: "ú",
  v: "ṽ",
  w: "ẃ",
  x: "ẋ",
  y: "ý",
  z: "ż",
  A: "Á",
  B: "Ḃ",
  C: "Ć",
  D: "Ḋ",
  E: "É",
  F: "Ƒ",
  G: "Ġ",
  H: "Ĥ",
  I: "Í",
  J: "Ĵ",
  K: "Ǩ",
  L: "Ĺ",
  M: "Ṁ",
  N: "Ń",
  O: "Ó",
  P: "Ṗ",
  Q: "Ɋ",
  R: "Ŕ",
  S: "Ś",
  T: "Ṫ",
  U: "Ú",
  V: "Ṽ",
  W: "Ẃ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ż",
};

const EXPANSION_RATIO = 0.35;

const FILLER = "·";

const OPEN_MARKER = "[";

const CLOSE_MARKER = "]";

const SUBMESSAGE_TYPES = new Set(["plural", "select", "selectordinal", "choice"]);

const ARGUMENT_NAME = /^(?:\d+|[A-Za-z_$][\w$-]*)$/;

const PROTECTED_TOKEN = new RegExp(
  [
    "\\{\\{[^{}]*\\}\\}",
    "\\$t\\([^()]*\\)",
    "%#@\\w+@",
    "%%",
    "%\\(\\w+\\)[-+0#]*(?:[1-9]\\d*)?(?:\\.\\d+)?[A-Za-z@]",
    "%(?:\\d+\\$)?[-+0#]*(?:[1-9]\\d*)?(?:\\.\\d+)?(?:hh|h|ll|l|q|z|j|t|L)?[A-Za-z@]",
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

interface IcuArgument {
  readonly type: string | null;
  readonly styleStart: number;
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

function findNameEnd(value: string, from: number, limit: number): number | null {
  for (let i = from; i < limit; i += 1) {
    const char = value.charAt(i);
    if (char === ",") {
      return i;
    }
    if (char === "{" || char === "}") {
      return null;
    }
  }
  return -1;
}

function parseIcuArgument(value: string, open: number, close: number): IcuArgument | null {
  const comma = findNameEnd(value, open + 1, close);
  if (comma === null) {
    return null;
  }
  const name = value.slice(open + 1, comma === -1 ? close : comma).trim();
  if (!ARGUMENT_NAME.test(name)) {
    return null;
  }
  if (comma === -1) {
    return { type: null, styleStart: -1 };
  }
  const secondComma = value.indexOf(",", comma + 1);
  if (secondComma === -1 || secondComma >= close) {
    return { type: value.slice(comma + 1, close).trim(), styleStart: -1 };
  }
  return { type: value.slice(comma + 1, secondComma).trim(), styleStart: secondComma + 1 };
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

function isSubmessage(argument: IcuArgument | null): boolean {
  if (argument === null || argument.type === null || argument.styleStart === -1) {
    return false;
  }
  return SUBMESSAGE_TYPES.has(argument.type);
}

function markArms(scan: Scan, start: number, end: number): void {
  let i = start;
  while (i < end) {
    const closeIndex = scan.value.charAt(i) === "{" ? closingBrace(scan, i) : -1;
    scan.mask[i] = 1;
    if (closeIndex === -1) {
      i += 1;
      continue;
    }
    markRange(scan, i + 1, closeIndex);
    scan.mask[closeIndex] = 1;
    i = closeIndex + 1;
  }
}

function markBrace(scan: Scan, open: number): number {
  const closeIndex = closingBrace(scan, open);
  if (closeIndex === -1) {
    scan.mask[open] = 1;
    return open + 1;
  }
  const argument = parseIcuArgument(scan.value, open, closeIndex);
  if (!isSubmessage(argument) || argument === null) {
    scan.mask.fill(1, open, closeIndex + 1);
    return closeIndex + 1;
  }
  scan.mask.fill(1, open, argument.styleStart);
  markArms(scan, argument.styleStart, closeIndex);
  scan.mask[closeIndex] = 1;
  return closeIndex + 1;
}

function markRange(scan: Scan, start: number, end: number): void {
  let i = start;
  while (i < end) {
    const tokenEnd = matchToken(scan.value, i, end);
    if (tokenEnd > i) {
      scan.mask.fill(1, i, tokenEnd);
      i = tokenEnd;
      continue;
    }
    i = scan.value.charAt(i) === "{" ? markBrace(scan, i) : i + 1;
  }
}

export function pseudolocalizeValue(value: string): string {
  if (value === "") {
    return "";
  }
  const scan: Scan = {
    value,
    close: matchingBraces(value),
    mask: new Uint8Array(value.length),
  };
  markRange(scan, 0, value.length);
  let body = "";
  let translatable = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i);
    if (scan.mask[i] === 1) {
      body += char;
      continue;
    }
    translatable += 1;
    body += ACCENTS[char] ?? char;
  }
  const padding = FILLER.repeat(Math.ceil(translatable * EXPANSION_RATIO));
  return `${OPEN_MARKER}${body}${padding}${CLOSE_MARKER}`;
}

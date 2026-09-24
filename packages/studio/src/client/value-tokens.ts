export type ValueSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "token"; readonly text: string };

const PRINTF_TOKEN = /%(?:\d+\$)?[-+0#]*\d*(?:\.\d+)?(?:ll|l|h)?[@sdifuxXoeEgGc]/y;
const MARKUP_TOKEN = /<\/?(?:[A-Za-z][\w:.-]*|\d+)(?:\s[^<>]*)?\/?>/y;
const BRACE_SIGILS = new Set(["#", "$", "%", "@"]);

function balancedBraceEnd(value: string, open: number): number {
  let depth = 0;
  for (let index = open; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return -1;
}

function braceTokenEnd(value: string, start: number): number {
  const char = value[start];
  if (char === "{") {
    return balancedBraceEnd(value, start);
  }
  if (char !== undefined && BRACE_SIGILS.has(char) && value[start + 1] === "{") {
    return balancedBraceEnd(value, start + 1);
  }
  return -1;
}

function stickyTokenEnd(pattern: RegExp, value: string, start: number): number {
  pattern.lastIndex = start;
  return pattern.test(value) ? pattern.lastIndex : -1;
}

function tokenEndAt(value: string, start: number): number {
  const brace = braceTokenEnd(value, start);
  if (brace !== -1) {
    return brace;
  }
  const printf = stickyTokenEnd(PRINTF_TOKEN, value, start);
  if (printf !== -1) {
    return printf;
  }
  return stickyTokenEnd(MARKUP_TOKEN, value, start);
}

export function segmentValue(value: string): readonly ValueSegment[] {
  const segments: ValueSegment[] = [];
  let textStart = 0;
  let index = 0;
  while (index < value.length) {
    const end = tokenEndAt(value, index);
    if (end === -1) {
      index += 1;
      continue;
    }
    if (index > textStart) {
      segments.push({ kind: "text", text: value.slice(textStart, index) });
    }
    segments.push({ kind: "token", text: value.slice(index, end) });
    index = end;
    textStart = end;
  }
  if (textStart < value.length) {
    segments.push({ kind: "text", text: value.slice(textStart) });
  }
  return segments;
}

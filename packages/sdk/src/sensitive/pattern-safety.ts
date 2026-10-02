interface Frame {
  repeats: boolean;
  alternates: boolean;
}

const BOUNDED_REPEAT = /^\{(\d+)(,(\d*))?\}/;

function repeatLength(source: string, index: number): number {
  const character = source.charAt(index);
  if (character === "*" || character === "+") {
    return 1;
  }
  const bounded = BOUNDED_REPEAT.exec(source.slice(index));
  if (bounded === null) {
    return 0;
  }
  const [token, low, comma, high] = bounded;
  const upper =
    comma === undefined ? Number(low) : high === "" ? Number.POSITIVE_INFINITY : Number(high);
  return upper > 1 ? token.length : 0;
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

function closeGroup(source: string, index: number, stack: Frame[]): boolean {
  const group = stack.pop();
  const repeat = repeatLength(source, index + 1);
  if (repeat > 0 && (group?.repeats === true || group?.alternates === true)) {
    return true;
  }
  const parent = stack.at(-1);
  if (parent !== undefined) {
    parent.repeats = parent.repeats || group?.repeats === true || repeat > 0;
  }
  return false;
}

function markTop(stack: Frame[], flag: keyof Frame): void {
  const frame = stack.at(-1);
  if (frame !== undefined) {
    frame[flag] = true;
  }
}

const UNSAFE = -1;

function step(source: string, index: number, stack: Frame[]): number {
  const character = source.charAt(index);
  switch (character) {
    case "\\":
      return index + 2;
    case "[":
      return skipClass(source, index);
    case "(":
      stack.push({ repeats: false, alternates: false });
      return skipGroupMarker(source, index + 1);
    case "|":
      markTop(stack, "alternates");
      return index + 1;
    case ")":
      return closeGroup(source, index, stack) ? UNSAFE : index + 1;
    default: {
      const repeat = repeatLength(source, index);
      if (repeat > 0) {
        markTop(stack, "repeats");
      }
      return index + Math.max(repeat, 1);
    }
  }
}

export function hasUnsafeRepeat(source: string): boolean {
  const stack: Frame[] = [{ repeats: false, alternates: false }];
  let index = 0;
  while (index < source.length) {
    index = step(source, index, stack);
    if (index === UNSAFE) {
      return true;
    }
  }
  return false;
}

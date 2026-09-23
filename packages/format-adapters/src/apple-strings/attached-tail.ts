const SPACE = 0x20;
const TAB = 0x09;
const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;

function skipSpacesAndTabs(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code !== SPACE && code !== TAB) {
      break;
    }
    i += 1;
  }
  return i;
}

function skipOptional(text: string, at: number, code: number): number {
  return at < text.length && text.charCodeAt(at) === code ? at + 1 : at;
}

export function isAttachedTail(tail: string): boolean {
  let i = skipSpacesAndTabs(tail, 0);
  i = skipOptional(tail, i, CARRIAGE_RETURN);
  i = skipOptional(tail, i, LINE_FEED);
  return skipSpacesAndTabs(tail, i) === tail.length;
}

import type { TextSpan } from "@verbatra/ai-providers";

const MIN_SEGMENT_LENGTH = 8;
const HEADER_PREFIX_LENGTH = "eyJ".length;
const TOKEN_START = /\beyJ/g;
const SEGMENT_CHARACTER = "[A-Za-z0-9_-]";
const SEGMENT = new RegExp(`${SEGMENT_CHARACTER}*`, "y");
const FULL_SEGMENT = `${SEGMENT_CHARACTER}{${MIN_SEGMENT_LENGTH},}`;
const PAYLOAD_AND_SIGNATURE = new RegExp(`\\.eyJ${FULL_SEGMENT}\\.${FULL_SEGMENT}`, "y");

function segmentEnd(text: string, from: number): number {
  SEGMENT.lastIndex = from;
  SEGMENT.exec(text);
  return SEGMENT.lastIndex;
}

function tokenEnd(text: string, start: number, headerEnd: number): number | undefined {
  if (headerEnd - start - HEADER_PREFIX_LENGTH < MIN_SEGMENT_LENGTH) {
    return undefined;
  }
  PAYLOAD_AND_SIGNATURE.lastIndex = headerEnd;
  return PAYLOAD_AND_SIGNATURE.exec(text) === null ? undefined : PAYLOAD_AND_SIGNATURE.lastIndex;
}

export function jwtSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  TOKEN_START.lastIndex = 0;
  let start = TOKEN_START.exec(text);
  while (start !== null) {
    const headerEnd = segmentEnd(text, start.index + HEADER_PREFIX_LENGTH);
    const end = tokenEnd(text, start.index, headerEnd);
    if (end !== undefined) {
      spans.push({ start: start.index, end });
    }
    TOKEN_START.lastIndex = end ?? headerEnd;
    start = TOKEN_START.exec(text);
  }
  return spans;
}

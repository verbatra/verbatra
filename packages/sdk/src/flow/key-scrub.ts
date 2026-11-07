import { findKeyShapes } from "@verbatra/ai-providers";
import { redact } from "../redact.js";

export function clipText(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const lastUnit = text.charCodeAt(max - 1);
  return text.slice(0, lastUnit >= 0xd800 && lastUnit <= 0xdbff ? max - 1 : max);
}

const MAX_SCRUB_LITERALS = 256;
const MAX_SCRUB_LITERAL_CHARS = 512;
const REDACTED_MARKER = "[REDACTED]";

export interface Scrubber {
  readonly scrub: (text: string) => string;
  readonly overflowed: boolean;
}

function escapeLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectLiterals(texts: Iterable<string>): { list: string[]; overflowed: boolean } {
  const seen = new Set<string>();
  let overflowed = false;
  for (const text of texts) {
    for (const span of findKeyShapes(text)) {
      const literal = text.slice(span.start, span.end);
      if (literal.length > MAX_SCRUB_LITERAL_CHARS || seen.size >= MAX_SCRUB_LITERALS) {
        overflowed = overflowed || !seen.has(literal);
        continue;
      }
      seen.add(literal);
    }
  }
  return { list: [...seen].sort((a, b) => b.length - a.length), overflowed };
}

export function makeScrubber(texts: Iterable<string>): Scrubber {
  const { list, overflowed } = collectLiterals(texts);
  if (list.length === 0) {
    return { scrub: redact, overflowed };
  }
  const pattern = new RegExp(list.map(escapeLiteral).join("|"), "g");
  return { scrub: (text) => redact(text.replace(pattern, REDACTED_MARKER)), overflowed };
}

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
/**
 * The longest literal the cross-scrub keeps. A value is returned only up to 4096 characters
 * (`KEY_HISTORY_MAX_VALUE_CHARS`), so no key that can appear in one is longer, and the longest
 * shape {@link redact} matches, an `sk-` token, is a few hundred characters in practice.
 */
const MAX_SCRUB_LITERAL_CHARS = 4096;
const MAX_SCRUB_TOTAL_CHARS = 65_536;
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
  let total = 0;
  let overflowed = false;
  for (const text of texts) {
    for (const span of findKeyShapes(text)) {
      const literal = text.slice(span.start, span.end);
      if (seen.has(literal)) {
        continue;
      }
      if (
        literal.length > MAX_SCRUB_LITERAL_CHARS ||
        seen.size >= MAX_SCRUB_LITERALS ||
        total + literal.length > MAX_SCRUB_TOTAL_CHARS
      ) {
        overflowed = true;
        continue;
      }
      seen.add(literal);
      total += literal.length;
    }
  }
  return { list: [...seen].sort((a, b) => b.length - a.length), overflowed };
}

function hideEverything(text: string): string {
  return text === "" ? "" : REDACTED_MARKER;
}

export function makeScrubber(texts: Iterable<string>): Scrubber {
  const { list, overflowed } = collectLiterals(texts);
  if (overflowed) {
    return { scrub: hideEverything, overflowed };
  }
  if (list.length === 0) {
    return { scrub: redact, overflowed };
  }
  const pattern = new RegExp(list.map(escapeLiteral).join("|"), "g");
  return { scrub: (text) => redact(text.replace(pattern, REDACTED_MARKER)), overflowed };
}

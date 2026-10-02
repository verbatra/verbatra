import type { TextSpan } from "@verbatra/ai-providers";

const LOCAL_CHARACTER = /[A-Za-z0-9._%+-]/;
const DOMAIN_CHARACTER = /[A-Za-z0-9.-]/;
const TRAILING_PUNCTUATION = /[.-]+$/;
const LABEL = /^[A-Za-z0-9-]+$/;
const TOP_LEVEL = /^[A-Za-z]{2,}$/;
const RESERVED_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;
const SCALED_ASSET = /^\d+(?:\.\d+)?x\.[A-Za-z0-9]+$/i;

function isAddressDomain(domain: string): boolean {
  const labels = domain.split(".");
  const topLevel = labels.at(-1) ?? "";
  return (
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    TOP_LEVEL.test(topLevel) &&
    !RESERVED_DOMAIN.test(domain) &&
    !SCALED_ASSET.test(domain)
  );
}

function localStart(text: string, at: number, floor: number): number {
  let start = at;
  while (start > floor && LOCAL_CHARACTER.test(text.charAt(start - 1))) {
    start -= 1;
  }
  return start;
}

function domainEnd(text: string, at: number): number {
  let end = at + 1;
  while (end < text.length && DOMAIN_CHARACTER.test(text.charAt(end))) {
    end += 1;
  }
  const domain = text.slice(at + 1, end);
  return end - (domain.length - domain.replace(TRAILING_PUNCTUATION, "").length);
}

export function emailSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  let floor = 0;
  let at = text.indexOf("@");
  while (at !== -1) {
    const start = localStart(text, at, floor);
    const end = domainEnd(text, at);
    if (start < at && isAddressDomain(text.slice(at + 1, end))) {
      spans.push({ start, end });
    }
    floor = at + 1;
    at = text.indexOf("@", floor);
  }
  return spans;
}

const PLACEHOLDER = /\{[^{}]+\}/gu;

export type Segment = { readonly text: string; readonly placeholder: boolean };

export function splitPlaceholders(text: string): ReadonlyArray<Segment> {
  const segments: Segment[] = [];
  let from = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match.index > from) {
      segments.push({ text: text.slice(from, match.index), placeholder: false });
    }
    segments.push({ text: match[0], placeholder: true });
    from = match.index + match[0].length;
  }
  if (from < text.length) segments.push({ text: text.slice(from), placeholder: false });
  return segments;
}

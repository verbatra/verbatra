const FENCE = /^\s*(?:```|~~~)/;
const HEADING = /^#{2,6} (.+)$/;

function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

function uniqueSlug(base: string, seen: Map<string, number>): string {
  let slug = base;
  if (seen.has(base)) {
    let suffix = seen.get(base) ?? 0;
    do {
      suffix += 1;
      slug = `${base}-${suffix}`;
    } while (seen.has(slug));
    seen.set(base, suffix);
  }
  seen.set(slug, 0);
  return slug;
}

function headingTexts(source: string): string[] {
  const texts: string[] = [];
  let fenced = false;
  for (const line of source.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    const text = fenced ? undefined : HEADING.exec(line)?.[1];
    if (text !== undefined) texts.push(text);
  }
  return texts;
}

export function headingSlugs(source: string): ReadonlyArray<string> {
  const seen = new Map<string, number>();
  return headingTexts(source).map((text) => uniqueSlug(slugOf(text), seen));
}

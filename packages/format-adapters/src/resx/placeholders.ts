const COMPOSITE_FORMAT_ITEM = /\{\{|\}\}|\{\s*(\d+)\s*(?:,\s*(-?\d+)\s*)?(?::([^{}]*))?\}|[{}]/g;

function canonicalItem(
  index: string,
  alignment: string | undefined,
  format: string | undefined,
): string {
  const aligned = alignment === undefined ? index : `${index},${alignment}`;
  return format === undefined ? `{${aligned}}` : `{${aligned}:${format}}`;
}

export function extractResxPlaceholders(value: string): readonly string[] {
  const out: string[] = [];
  for (const match of value.matchAll(COMPOSITE_FORMAT_ITEM)) {
    const index = match[1];
    out.push(index === undefined ? match[0] : canonicalItem(index, match[2], match[3]));
  }
  return out;
}

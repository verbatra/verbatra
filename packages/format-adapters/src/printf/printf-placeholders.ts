const PRINTF_TOKEN =
  /%(?:(\d+)\$)?[-+0#]*(?:[1-9]\d*)?(?:\.\d+)?(?:hh|h|ll|l|q|z|j|t|L)?([A-Za-z@])|%%/g;

export interface PrintfPlaceholderOptions {
  readonly conversions: ReadonlySet<string>;
}

export function extractPrintfPlaceholders(
  value: string,
  options: PrintfPlaceholderOptions,
): readonly string[] {
  const out: string[] = [];
  for (const match of value.matchAll(PRINTF_TOKEN)) {
    if (match[0] === "%%") {
      out.push("%%");
      continue;
    }
    const conversion = match[2];
    if (conversion === undefined || !options.conversions.has(conversion)) {
      continue;
    }
    const position = match[1];
    out.push(position === undefined ? `%${conversion}` : `%${position}$${conversion}`);
  }
  return out;
}

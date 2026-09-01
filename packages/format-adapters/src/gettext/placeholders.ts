const GETTEXT_PLACEHOLDER =
  /%(?:\((\w+)\))?(?:(\d+)\$)?[-+0 #]*(?:[1-9]\d*)?(?:\.\d+)?([disuoxXfFeEgGc])|%%/g;

export function extractGettextPlaceholders(value: string): readonly string[] {
  const out: string[] = [];
  for (const match of value.matchAll(GETTEXT_PLACEHOLDER)) {
    if (match[0] === "%%") {
      out.push("%%");
      continue;
    }
    const [, name, position, conversion] = match;
    /* v8 ignore start -- defensive: the only alternative with no conversion capture is "%%",
     * already handled above, so a non-"%%" match always carries the mandatory conversion group. */
    if (conversion === undefined) {
      continue;
    }
    /* v8 ignore stop */
    if (name !== undefined) {
      out.push(`%(${name})${conversion}`);
    } else if (position !== undefined) {
      out.push(`%${position}$${conversion}`);
    } else {
      out.push(`%${conversion}`);
    }
  }
  return out;
}

export function inSourceOrder<V>(
  sourceKeys: Iterable<string>,
  values: ReadonlyMap<string, V>,
): ReadonlyArray<readonly [string, V]> {
  const ordered: Array<readonly [string, V]> = [];
  for (const key of sourceKeys) {
    const value = values.get(key);
    if (value !== undefined) {
      ordered.push([key, value]);
    }
  }
  if (ordered.length < values.size) {
    const placed = new Set(ordered.map(([key]) => key));
    for (const entry of values) {
      if (!placed.has(entry[0])) {
        ordered.push(entry);
      }
    }
  }
  return ordered;
}

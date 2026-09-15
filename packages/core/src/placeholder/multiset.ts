export function countTokens(items: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  return map;
}

export function multisetExcess(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): string[] {
  const excess: string[] = [];
  for (const [token, count] of a) {
    const surplus = count - (b.get(token) ?? 0);
    for (let i = 0; i < surplus; i += 1) {
      excess.push(token);
    }
  }
  return excess.sort();
}

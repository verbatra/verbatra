export function caseInsensitiveRepeats(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const repeats: string[] = [];
  for (const value of values) {
    const lowered = value.toLowerCase();
    if (seen.has(lowered)) {
      repeats.push(value);
    }
    seen.add(lowered);
  }
  return repeats;
}

export function didYouMeanHint(key: string, candidates: readonly string[]): string {
  const lowered = key.toLowerCase();
  const match = candidates.find((candidate) => candidate.toLowerCase() === lowered);
  return match === undefined ? "" : `; did you mean "${match}"?`;
}

export function toMaxLengthMap(
  budgets: Readonly<Record<string, number>> | undefined,
): ReadonlyMap<string, number> | undefined {
  if (budgets === undefined) {
    return undefined;
  }
  const entries = Object.entries(budgets);
  return entries.length === 0 ? undefined : new Map(entries);
}

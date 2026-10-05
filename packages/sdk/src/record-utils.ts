export function sortRecordKeys<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function ownValue<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}

export function renameRecordKeys<T>(
  record: Readonly<Record<string, T>>,
  renames: ReadonlyMap<string, string>,
): Record<string, T> {
  const applicable = new Map([...renames].filter(([from]) => Object.hasOwn(record, from)));
  const replaced = new Set(applicable.values());
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !replaced.has(key))
      .map(([key, value]) => [applicable.get(key) ?? key, value]),
  );
}

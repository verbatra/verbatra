export interface EntryRef {
  readonly locale: string;
  readonly key: string;
}

export function entryIdentity(entry: EntryRef): string {
  return JSON.stringify([entry.locale, entry.key]);
}

export function uniqueByIdentity<E extends EntryRef>(entries: readonly E[]): E[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const identity = entryIdentity(entry);
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}
